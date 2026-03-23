/**
 * MLPipelineService.ts
 * BRD v3 §3.2 — ML Model pipeline: versioning, training, shadow deployment, rollback.
 * NEW v3.0: Automated via BullMQ. Models stored in /data/models/{name}/{timestamp}/.
 * Each deployment tagged with git commit SHA. 7-day retention before deletion.
 * Shadow deployment: 7-day parallel run before production promotion.
 *
 * Model specs:
 *   Volume Predictor    — LSTM 48-step, retrain weekly,    rollback if accuracy < 60%
 *   Price Trend         — Transformer 4-head, bi-weekly,   rollback if precision < 65%
 *   Volatility Forecaster — GARCH+neural, daily,           rollback if RMSE > threshold
 *   Strategy Selector   — XGBoost ensemble, monthly,       rollback if win rate < 55%
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelName =
  | 'volume_predictor'
  | 'price_trend_classifier'
  | 'volatility_forecaster'
  | 'strategy_selector';

export type ModelStatus = 'training' | 'shadow' | 'production' | 'rollback' | 'retired';

export interface ModelVersion {
  modelName: ModelName;
  version: string;        // ISO timestamp: 2026-03-22T10:00:00Z
  gitSha: string;
  status: ModelStatus;
  trainedAt: Date;
  promotedAt: Date | null;
  retiredAt: Date | null;
  metrics: ModelMetrics;
  modelPath: string;      // /data/models/{name}/{version}/
}

export interface ModelMetrics {
  accuracy?: number;       // Volume Predictor
  precision?: number;      // Price Trend Classifier
  rmse?: number;           // Volatility Forecaster
  winRate?: number;        // Strategy Selector
  sharpeRatio?: number;    // all models
  validationLoss?: number;
}

// BRD v3 §3.2 rollback triggers per model
const ROLLBACK_TRIGGERS: Record<ModelName, (m: ModelMetrics) => boolean> = {
  volume_predictor:       (m) => (m.accuracy ?? 1) < 0.60,
  price_trend_classifier: (m) => (m.precision ?? 1) < 0.65,
  volatility_forecaster:  (m) => (m.rmse ?? 0) > 0.05,    // >5% RMSE
  strategy_selector:      (m) => (m.winRate ?? 1) < 0.55,
};

// BRD v3 §3.2 retrain frequencies (ms)
const RETRAIN_INTERVALS: Record<ModelName, number> = {
  volume_predictor:       7 * 24 * 3_600_000,   // weekly
  price_trend_classifier: 14 * 24 * 3_600_000,  // bi-weekly
  volatility_forecaster:  24 * 3_600_000,        // daily
  strategy_selector:      30 * 24 * 3_600_000,  // monthly
};

const SHADOW_DURATION_MS = 7 * 24 * 3_600_000;  // 7-day shadow run
const RETENTION_MS = 7 * 24 * 3_600_000;         // keep old versions 7 days

// ─── MLPipelineService ────────────────────────────────────────────────────────

export class MLPipelineService {
  private modelsDir: string;
  private versions: Map<string, ModelVersion> = new Map(); // key: `${name}/${version}`
  private productionModels: Map<ModelName, ModelVersion> = new Map();
  private shadowModels: Map<ModelName, ModelVersion> = new Map();
  private retrainTimers: Map<ModelName, NodeJS.Timeout> = new Map();
  private gitSha: string;

  // Injected — keeps service testable
  private trainModel: (name: ModelName, dataPath: string) => Promise<ModelMetrics>;
  private evaluateModel: (name: ModelName, version: string) => Promise<ModelMetrics>;
  private notifySlack: (msg: string) => Promise<void>;

  constructor(deps: {
    modelsDir?: string;
    trainModel: (name: ModelName, dataPath: string) => Promise<ModelMetrics>;
    evaluateModel: (name: ModelName, version: string) => Promise<ModelMetrics>;
    notifySlack?: (msg: string) => Promise<void>;
  }) {
    this.modelsDir = deps.modelsDir ?? '/data/models';
    this.trainModel = deps.trainModel;
    this.evaluateModel = deps.evaluateModel;
    this.notifySlack = deps.notifySlack ?? (async () => {});
    this.gitSha = process.env.GIT_COMMIT_SHA ?? 'unknown';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    fs.mkdirSync(this.modelsDir, { recursive: true });
    await this.loadExistingVersions();
    this.scheduleRetraining();
    logger.info(`[MLPipeline] Initialized. Models dir: ${this.modelsDir}`);
    logger.info(`[MLPipeline] Production models: ${Array.from(this.productionModels.keys()).join(', ') || 'none'}`);
  }

  stop(): void {
    for (const timer of this.retrainTimers.values()) clearInterval(timer);
    this.retrainTimers.clear();
  }

  // ── Training Pipeline (BRD v3 §3.2) ───────────────────────────────────────

  /**
   * Full pipeline: train → evaluate → shadow deploy → promote if metrics pass.
   */
  async runPipeline(name: ModelName, dataPath: string): Promise<ModelVersion> {
    const version = new Date().toISOString().replace(/[:.]/g, '-');
    const modelPath = path.join(this.modelsDir, name, version);

    logger.info(`[MLPipeline] Starting pipeline: ${name} v${version}`);

    // Step 1: Feature engineering + train (80/20 split handled in trainModel)
    let metrics: ModelMetrics;
    try {
      metrics = await this.trainModel(name, dataPath);
      logger.info(`[MLPipeline] Training complete: ${name} | metrics: ${JSON.stringify(metrics)}`);
    } catch (err) {
      logger.error(`[MLPipeline] Training failed for ${name}:`, err);
      throw err;
    }

    // Step 2: Model evaluation
    const evalMetrics = await this.evaluateModel(name, version);
    const finalMetrics = { ...metrics, ...evalMetrics };

    // Step 3: Check rollback trigger — if metrics fail gate, don't proceed
    if (ROLLBACK_TRIGGERS[name](finalMetrics)) {
      logger.warn(`[MLPipeline] ${name} failed quality gate — discarding. Metrics: ${JSON.stringify(finalMetrics)}`);
      await this.notifySlack(`⚠️ ML Pipeline: ${name} failed quality gate, keeping current production model`);
      throw new Error(`Model ${name} failed quality gate: ${JSON.stringify(finalMetrics)}`);
    }

    // Step 4: Save version metadata
    fs.mkdirSync(modelPath, { recursive: true });
    const modelVersion: ModelVersion = {
      modelName: name,
      version,
      gitSha: this.gitSha,
      status: 'shadow',
      trainedAt: new Date(),
      promotedAt: null,
      retiredAt: null,
      metrics: finalMetrics,
      modelPath,
    };

    this.saveVersionMeta(modelVersion);
    this.versions.set(`${name}/${version}`, modelVersion);

    // Step 5: Shadow deployment — 7-day parallel run before promotion
    this.shadowModels.set(name, modelVersion);
    logger.info(`[MLPipeline] ${name} v${version} in shadow deployment for 7 days`);
    await this.notifySlack(`🔬 ML Pipeline: ${name} v${version} entering 7-day shadow deployment`);

    // Schedule production promotion after shadow period
    setTimeout(async () => {
      await this.promoteToProduction(name, version);
    }, SHADOW_DURATION_MS);

    return modelVersion;
  }

  // ── Promotion & Rollback ───────────────────────────────────────────────────

  async promoteToProduction(name: ModelName, version: string): Promise<void> {
    const key = `${name}/${version}`;
    const candidate = this.versions.get(key);
    if (!candidate) {
      logger.error(`[MLPipeline] Cannot promote ${key} — not found`);
      return;
    }

    // Re-evaluate after shadow period
    const shadowMetrics = await this.evaluateModel(name, version);
    if (ROLLBACK_TRIGGERS[name](shadowMetrics)) {
      logger.warn(`[MLPipeline] ${name} v${version} failed shadow evaluation — not promoting`);
      candidate.status = 'rollback';
      this.saveVersionMeta(candidate);
      await this.notifySlack(`❌ ML Pipeline: ${name} v${version} failed shadow evaluation, not promoted`);
      return;
    }

    // Retire current production
    const current = this.productionModels.get(name);
    if (current) {
      current.status = 'retired';
      current.retiredAt = new Date();
      this.saveVersionMeta(current);
      // Schedule deletion after 7-day retention
      setTimeout(() => this.deleteVersion(name, current.version), RETENTION_MS);
    }

    // Promote
    candidate.status = 'production';
    candidate.promotedAt = new Date();
    this.productionModels.set(name, candidate);
    this.shadowModels.delete(name);
    this.saveVersionMeta(candidate);

    logger.info(`[MLPipeline] PROMOTED: ${name} v${version} → production (git: ${candidate.gitSha})`);
    await this.notifySlack(`✅ ML Pipeline: ${name} v${version} promoted to production (git: ${candidate.gitSha.slice(0, 8)})`);
  }

  rollback(name: ModelName, targetVersion: string): boolean {
    const key = `${name}/${targetVersion}`;
    const target = this.versions.get(key);
    if (!target) {
      logger.error(`[MLPipeline] Rollback target not found: ${key}`);
      return false;
    }

    const current = this.productionModels.get(name);
    if (current) {
      current.status = 'rollback';
      current.retiredAt = new Date();
      this.saveVersionMeta(current);
    }

    target.status = 'production';
    target.promotedAt = new Date();
    this.productionModels.set(name, target);
    this.saveVersionMeta(target);

    logger.warn(`[MLPipeline] ROLLBACK: ${name} → v${targetVersion}`);
    return true;
  }

  // ── Scheduled Retraining ───────────────────────────────────────────────────

  private scheduleRetraining(): void {
    const models: ModelName[] = [
      'volume_predictor',
      'price_trend_classifier',
      'volatility_forecaster',
      'strategy_selector',
    ];

    for (const name of models) {
      const interval = RETRAIN_INTERVALS[name];
      const timer = setInterval(async () => {
        logger.info(`[MLPipeline] Scheduled retrain triggered: ${name}`);
        try {
          await this.runPipeline(name, '/data/pool_snapshots');
        } catch (err) {
          logger.error(`[MLPipeline] Scheduled retrain failed for ${name}:`, err);
        }
      }, interval);

      this.retrainTimers.set(name, timer);
      logger.info(`[MLPipeline] Retrain scheduled: ${name} every ${interval / 3_600_000}h`);
    }
  }

  // ── Version Management ─────────────────────────────────────────────────────

  getProductionVersion(name: ModelName): ModelVersion | undefined {
    return this.productionModels.get(name);
  }

  getAllVersions(name: ModelName): ModelVersion[] {
    return Array.from(this.versions.values()).filter(v => v.modelName === name);
  }

  private saveVersionMeta(v: ModelVersion): void {
    const metaPath = path.join(v.modelPath, 'meta.json');
    try {
      fs.mkdirSync(v.modelPath, { recursive: true });
      fs.writeFileSync(metaPath, JSON.stringify(v, null, 2));
    } catch (err) {
      logger.error(`[MLPipeline] Failed to save meta for ${v.modelName}/${v.version}:`, err);
    }
  }

  private async loadExistingVersions(): Promise<void> {
    if (!fs.existsSync(this.modelsDir)) return;

    const names = fs.readdirSync(this.modelsDir);
    for (const name of names) {
      const nameDir = path.join(this.modelsDir, name);
      if (!fs.statSync(nameDir).isDirectory()) continue;

      const versions = fs.readdirSync(nameDir).sort().reverse();
      for (const version of versions) {
        const metaPath = path.join(nameDir, version, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta: ModelVersion = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          this.versions.set(`${name}/${version}`, meta);
          if (meta.status === 'production') {
            this.productionModels.set(meta.modelName, meta);
          }
        } catch (err) {
          logger.warn(`[MLPipeline] Could not load meta: ${metaPath}`);
        }
      }
    }

    logger.info(`[MLPipeline] Loaded ${this.versions.size} model versions`);
  }

  private deleteVersion(name: ModelName, version: string): void {
    const versionPath = path.join(this.modelsDir, name, version);
    try {
      fs.rmSync(versionPath, { recursive: true, force: true });
      this.versions.delete(`${name}/${version}`);
      logger.info(`[MLPipeline] Deleted old version: ${name}/${version}`);
    } catch (err) {
      logger.warn(`[MLPipeline] Failed to delete ${name}/${version}:`, err);
    }
  }
}
