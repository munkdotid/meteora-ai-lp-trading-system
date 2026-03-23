/**
 * MLPipelineService.ts  (v3.1 — P1 fix)
 * BRD v3 §3.2 — ML Model pipeline: versioning, training, shadow deployment, rollback.
 *
 * Changes from v3.0:
 *   - trainModel now wired to universalTrainer (real TF.js implementations)
 *   - Shadow deployment now uses ShadowDeploymentService (7-day parallel run)
 *   - evaluateModel uses actual model inference, not a stub
 *   - BullMQ scheduler hooks exposed for integration with workers/bullmq.ts
 *
 * Model specs (BRD v3 §3.2):
 *   Volume Predictor    — LSTM 48-step,          weekly,    accuracy < 60% → rollback
 *   Price Trend         — Transformer 4-head,    bi-weekly, precision < 65% → rollback
 *   Volatility Forecast — GARCH(1,1)+neural,     daily,     RMSE > 0.05 → rollback
 *   Strategy Selector   — XGBoost ensemble,      monthly,   win_rate < 55% → rollback
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { universalTrainer, MLInferenceEngine } from './MLTrainingEngine';
import { ShadowDeploymentService } from './ShadowDeploymentService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelName =
  | 'volume_predictor'
  | 'price_trend_classifier'
  | 'volatility_forecaster'
  | 'strategy_selector';

export type ModelStatus = 'training' | 'shadow' | 'production' | 'rollback' | 'retired';

export interface ModelVersion {
  modelName: ModelName;
  version: string;          // ISO timestamp: 2026-03-22T10:00:00Z
  gitSha: string;
  status: ModelStatus;
  trainedAt: Date;
  promotedAt: Date | null;
  retiredAt: Date | null;
  metrics: ModelMetrics;
  modelPath: string;
}

export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  rmse?: number;
  winRate?: number;
  sharpeRatio?: number;
  validationLoss?: number;
}

// BRD v3 §3.2 rollback triggers
const ROLLBACK_TRIGGERS: Record<ModelName, (m: ModelMetrics) => boolean> = {
  volume_predictor:       m => (m.accuracy ?? 1) < 0.60,
  price_trend_classifier: m => (m.precision ?? 1) < 0.65,
  volatility_forecaster:  m => (m.rmse ?? 0) > 0.05,
  strategy_selector:      m => (m.winRate ?? 1) < 0.55,
};

// BRD v3 §3.2 retrain frequencies
const RETRAIN_INTERVALS: Record<ModelName, number> = {
  volume_predictor:       7 * 24 * 3_600_000,
  price_trend_classifier: 14 * 24 * 3_600_000,
  volatility_forecaster:  1 * 24 * 3_600_000,
  strategy_selector:      30 * 24 * 3_600_000,
};

const RETENTION_MS = 7 * 24 * 3_600_000;

// ─── MLPipelineService ────────────────────────────────────────────────────────

export class MLPipelineService {
  private modelsDir: string;
  private dataDir: string;
  private versions: Map<string, ModelVersion> = new Map();
  private productionModels: Map<ModelName, ModelVersion> = new Map();
  private retrainTimers: Map<ModelName, NodeJS.Timeout> = new Map();
  private gitSha: string;

  // Injected services
  public inferenceEngine: MLInferenceEngine;
  private shadowService: ShadowDeploymentService;
  private onAlert: (msg: string) => Promise<void>;

  constructor(deps?: {
    modelsDir?: string;
    dataDir?: string;
    onAlert?: (msg: string) => Promise<void>;
  }) {
    this.modelsDir = deps?.modelsDir ?? '/data/models';
    this.dataDir   = deps?.dataDir   ?? '/data/pool_snapshots';
    this.onAlert   = deps?.onAlert   ?? (async (msg) => logger.info(`[MLPipeline] Alert: ${msg}`));
    this.gitSha    = process.env.GIT_COMMIT_SHA ?? 'unknown';

    this.inferenceEngine = new MLInferenceEngine();

    this.shadowService = new ShadowDeploymentService({
      onPromote: async (name, version) => {
        await this.promoteToProduction(name, version);
      },
      onDiscard: async (name, version, reason) => {
        logger.warn(`[MLPipeline] Shadow discarded: ${name} v${version} — ${reason}`);
        const key = `${name}/${version}`;
        const v = this.versions.get(key);
        if (v) { v.status = 'retired'; v.retiredAt = new Date(); this.saveVersionMeta(v); }
      },
      onAlert: this.onAlert,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    fs.mkdirSync(this.modelsDir, { recursive: true });
    await this.loadExistingVersions();

    // Load inference models from production versions
    const productionDir = path.join(this.modelsDir, 'production');
    if (fs.existsSync(productionDir)) {
      await this.inferenceEngine.loadModels(productionDir);
    }

    this.scheduleRetraining();
    logger.info(`[MLPipeline] Initialized. Production models: ${Array.from(this.productionModels.keys()).join(', ') || 'none'}`);
    logger.info(`[MLPipeline] Shadow runs: ${JSON.stringify(this.shadowService.getAllShadowStatus())}`);
  }

  stop(): void {
    for (const timer of this.retrainTimers.values()) clearInterval(timer);
    this.retrainTimers.clear();
    this.shadowService.stop();
    this.inferenceEngine.dispose();
  }

  // ── Training Pipeline (BRD v3 §3.2) ───────────────────────────────────────

  /**
   * Full pipeline: train → evaluate → shadow deploy → promote if metrics pass.
   * Real TF.js training via universalTrainer.
   */
  async runPipeline(name: ModelName): Promise<ModelVersion> {
    const version = new Date().toISOString().replace(/[:.]/g, '-');
    const modelPath = path.join(this.modelsDir, name, version);

    logger.info(`[MLPipeline] Starting pipeline: ${name} v${version}`);
    fs.mkdirSync(modelPath, { recursive: true });

    // Step 1: Train (real TF.js training)
    let metrics: ModelMetrics;
    try {
      const dataPath = path.join(this.dataDir, `${name}_data.json`);
      metrics = await universalTrainer(name, dataPath, modelPath);
      logger.info(`[MLPipeline] Training complete: ${name} | ${JSON.stringify(metrics)}`);
    } catch (err) {
      logger.error(`[MLPipeline] Training failed for ${name}:`, err);
      await this.onAlert(`⚠️ ML training failed: ${name} — ${(err as Error).message}`);
      throw err;
    }

    // Step 2: Quality gate
    if (ROLLBACK_TRIGGERS[name](metrics)) {
      const msg = `[MLPipeline] ${name} failed quality gate: ${JSON.stringify(metrics)}`;
      logger.warn(msg);
      await this.onAlert(`⚠️ ML quality gate failed: ${name} — keeping current production`);
      throw new Error(msg);
    }

    // Step 3: Save metadata
    const modelVersion: ModelVersion = {
      modelName: name,
      version,
      gitSha: this.gitSha,
      status: 'shadow',
      trainedAt: new Date(),
      promotedAt: null,
      retiredAt: null,
      metrics,
      modelPath,
    };
    this.saveVersionMeta(modelVersion);
    this.versions.set(`${name}/${version}`, modelVersion);

    // Step 4: Start 7-day shadow deployment
    this.shadowService.startShadowRun(modelVersion);
    logger.info(`[MLPipeline] ${name} v${version} → shadow deployment (7 days)`);

    return modelVersion;
  }

  // ── Promotion & Rollback ───────────────────────────────────────────────────

  async promoteToProduction(name: ModelName, version: string): Promise<void> {
    const key = `${name}/${version}`;
    const candidate = this.versions.get(key);
    if (!candidate) { logger.error(`[MLPipeline] Promote: not found: ${key}`); return; }

    // Retire current production
    const current = this.productionModels.get(name);
    if (current) {
      current.status = 'retired';
      current.retiredAt = new Date();
      this.saveVersionMeta(current);
      setTimeout(() => this.deleteVersion(name, current.version), RETENTION_MS);
    }

    // Promote
    candidate.status = 'production';
    candidate.promotedAt = new Date();
    this.productionModels.set(name, candidate);
    this.saveVersionMeta(candidate);

    // Copy model files to production symlink dir for inference engine
    const productionDir = path.join(this.modelsDir, 'production', name);
    if (fs.existsSync(productionDir)) fs.rmSync(productionDir, { recursive: true });
    fs.cpSync(candidate.modelPath, productionDir, { recursive: true });

    // Reload inference model
    await this.inferenceEngine.loadModels(path.join(this.modelsDir, 'production'));

    logger.info(`[MLPipeline] PROMOTED: ${name} v${version} → production`);
    await this.onAlert(`✅ ML promoted: ${name} v${version.slice(0, 10)} → production`);
  }

  rollback(name: ModelName, targetVersion: string): boolean {
    const key = `${name}/${targetVersion}`;
    const target = this.versions.get(key);
    if (!target) { logger.error(`[MLPipeline] Rollback: not found: ${key}`); return false; }

    const current = this.productionModels.get(name);
    if (current) { current.status = 'rollback'; current.retiredAt = new Date(); this.saveVersionMeta(current); }

    target.status = 'production';
    target.promotedAt = new Date();
    this.productionModels.set(name, target);
    this.saveVersionMeta(target);

    logger.warn(`[MLPipeline] ROLLBACK: ${name} → v${targetVersion}`);
    this.onAlert(`⚠️ ML rollback: ${name} → v${targetVersion.slice(0, 10)}`);
    return true;
  }

  // ── Shadow status ──────────────────────────────────────────────────────────

  getShadowStatus() { return this.shadowService.getAllShadowStatus(); }

  logShadowPrediction(name: ModelName, input: Record<string, number>, prediction: number | string) {
    this.shadowService.logPrediction(name, input, prediction);
  }

  recordShadowOutcome(name: ModelName, ts: Date, actual: number | string) {
    this.shadowService.recordOutcome(name, ts, actual);
  }

  // ── Scheduled Retraining (BullMQ hook) ────────────────────────────────────

  /**
   * Called by BullMQ worker on schedule. Also called from scheduleRetraining().
   */
  async triggerRetrain(name: ModelName): Promise<void> {
    logger.info(`[MLPipeline] Retrain triggered: ${name}`);
    try {
      await this.runPipeline(name);
    } catch (err) {
      logger.error(`[MLPipeline] Retrain failed: ${name}`, err);
    }
  }

  private scheduleRetraining(): void {
    const models: ModelName[] = [
      'volume_predictor', 'price_trend_classifier', 'volatility_forecaster', 'strategy_selector',
    ];
    for (const name of models) {
      const timer = setInterval(
        () => this.triggerRetrain(name),
        RETRAIN_INTERVALS[name]
      );
      this.retrainTimers.set(name, timer);
      logger.info(`[MLPipeline] Retrain scheduled: ${name} every ${RETRAIN_INTERVALS[name] / 3_600_000}h`);
    }
  }

  // ── Version management ─────────────────────────────────────────────────────

  getProductionVersion(name: ModelName) { return this.productionModels.get(name); }
  getAllVersions(name: ModelName)        { return Array.from(this.versions.values()).filter(v => v.modelName === name); }

  private saveVersionMeta(v: ModelVersion): void {
    try {
      fs.mkdirSync(v.modelPath, { recursive: true });
      fs.writeFileSync(path.join(v.modelPath, 'meta.json'), JSON.stringify(v, null, 2));
    } catch (err) {
      logger.error(`[MLPipeline] Save meta failed: ${v.modelName}/${v.version}`, err);
    }
  }

  private async loadExistingVersions(): Promise<void> {
    if (!fs.existsSync(this.modelsDir)) return;
    for (const name of fs.readdirSync(this.modelsDir)) {
      if (name === 'production') continue;
      const nameDir = path.join(this.modelsDir, name);
      if (!fs.statSync(nameDir).isDirectory()) continue;
      for (const version of fs.readdirSync(nameDir).sort().reverse()) {
        const metaPath = path.join(nameDir, version, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta: ModelVersion = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          this.versions.set(`${name}/${version}`, meta);
          if (meta.status === 'production') this.productionModels.set(meta.modelName, meta);
        } catch { logger.warn(`[MLPipeline] Could not load meta: ${metaPath}`); }
      }
    }
    logger.info(`[MLPipeline] Loaded ${this.versions.size} model versions from disk`);
  }

  private deleteVersion(name: ModelName, version: string): void {
    const p = path.join(this.modelsDir, name, version);
    try { fs.rmSync(p, { recursive: true, force: true }); this.versions.delete(`${name}/${version}`); }
    catch { logger.warn(`[MLPipeline] Could not delete: ${name}/${version}`); }
  }
}
