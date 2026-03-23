/**
 * ShadowDeploymentService.ts
 * BRD v3 §3.2 — Shadow deployment: 7-day parallel run before production promotion.
 *
 * Flow:
 *   1. New model enters shadow mode alongside current production model
 *   2. Both models receive identical live data and make predictions
 *   3. Shadow predictions are logged but NOT used for trading decisions
 *   4. After 7 days, shadow metrics are compared against gate thresholds
 *   5. If metrics pass → promote to production; if fail → discard
 *
 * This ensures new models are battle-tested on live market data before
 * they influence real trades.
 */

import { logger } from '../utils/logger';
import type { ModelName, ModelMetrics, ModelVersion } from './MLPipelineService';
import type { PoolSnapshot } from './MLTrainingEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShadowPrediction {
  modelName: ModelName;
  shadowVersion: string;
  timestamp: Date;
  input: Record<string, number>;
  prediction: number | string;
  actual?: number | string;   // filled in after outcome is known
  correct?: boolean;
}

export interface ShadowRunStats {
  modelName: ModelName;
  shadowVersion: string;
  startedAt: Date;
  daysElapsed: number;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  precision?: number;
  rmse?: number;
  winRate?: number;
  passesGate: boolean;
  gateDetails: string;
}

// Gate thresholds (same as ROLLBACK_TRIGGERS in MLPipelineService)
const SHADOW_GATES: Record<ModelName, (stats: ShadowRunStats) => { pass: boolean; reason: string }> = {
  volume_predictor:       s => ({ pass: s.accuracy >= 0.60, reason: `accuracy=${(s.accuracy * 100).toFixed(1)}% (need ≥60%)` }),
  price_trend_classifier: s => ({ pass: (s.precision ?? 0) >= 0.65, reason: `precision=${((s.precision ?? 0) * 100).toFixed(1)}% (need ≥65%)` }),
  volatility_forecaster:  s => ({ pass: (s.rmse ?? 1) <= 0.05, reason: `RMSE=${(s.rmse ?? 1).toFixed(4)} (need ≤0.05)` }),
  strategy_selector:      s => ({ pass: (s.winRate ?? 0) >= 0.55, reason: `win_rate=${((s.winRate ?? 0) * 100).toFixed(1)}% (need ≥55%)` }),
};

const SHADOW_DURATION_MS = 7 * 24 * 3_600_000; // 7 days
const MAX_PREDICTIONS_STORED = 10_000;          // cap in-memory log

// ─── ShadowDeploymentService ──────────────────────────────────────────────────

export class ShadowDeploymentService {
  // Active shadow runs: modelName → shadow metadata
  private shadowRuns: Map<ModelName, {
    version: ModelVersion;
    startedAt: Date;
    predictions: ShadowPrediction[];
    promotionTimer: NodeJS.Timeout | null;
  }> = new Map();

  // Callbacks injected at construction time
  private onPromote: (name: ModelName, version: string) => Promise<void>;
  private onDiscard: (name: ModelName, version: string, reason: string) => Promise<void>;
  private onAlert: (msg: string) => Promise<void>;

  constructor(deps: {
    onPromote: (name: ModelName, version: string) => Promise<void>;
    onDiscard: (name: ModelName, version: string, reason: string) => Promise<void>;
    onAlert?: (msg: string) => Promise<void>;
  }) {
    this.onPromote  = deps.onPromote;
    this.onDiscard  = deps.onDiscard;
    this.onAlert    = deps.onAlert ?? (async () => {});
  }

  // ── Start shadow run ───────────────────────────────────────────────────────

  /**
   * Begin a 7-day shadow deployment for a newly trained model.
   * Call this immediately after training completes and metrics pass initial gate.
   */
  startShadowRun(version: ModelVersion): void {
    const { modelName } = version;

    // Cancel any existing shadow run for this model
    const existing = this.shadowRuns.get(modelName);
    if (existing) {
      logger.warn(`[Shadow] Replacing existing shadow run for ${modelName}`);
      if (existing.promotionTimer) clearTimeout(existing.promotionTimer);
    }

    const startedAt = new Date();

    // Schedule promotion evaluation after 7 days
    const promotionTimer = setTimeout(async () => {
      await this.evaluateAndPromote(modelName);
    }, SHADOW_DURATION_MS);

    this.shadowRuns.set(modelName, {
      version,
      startedAt,
      predictions: [],
      promotionTimer,
    });

    logger.info(`[Shadow] Started 7-day shadow run: ${modelName} v${version.version}`);
    logger.info(`[Shadow] Promotion scheduled for: ${new Date(Date.now() + SHADOW_DURATION_MS).toISOString()}`);

    this.onAlert(`🔬 Shadow deployment started: ${modelName} v${version.version.slice(0, 10)}... (7 days until evaluation)`);
  }

  // ── Log shadow predictions ─────────────────────────────────────────────────

  /**
   * Record a prediction made by the shadow model.
   * Call this every time the production model makes a prediction — pass
   * the shadow model's output for the same input alongside.
   */
  logPrediction(
    modelName: ModelName,
    input: Record<string, number>,
    prediction: number | string
  ): void {
    const run = this.shadowRuns.get(modelName);
    if (!run) return;

    if (run.predictions.length >= MAX_PREDICTIONS_STORED) {
      run.predictions.shift(); // rolling window
    }

    run.predictions.push({
      modelName,
      shadowVersion: run.version.version,
      timestamp: new Date(),
      input,
      prediction,
    });
  }

  /**
   * Fill in the actual outcome for a previous prediction (e.g. what volume
   * actually occurred, which strategy was actually most profitable).
   * Called by MemoryAgent when outcomes are known.
   */
  recordOutcome(
    modelName: ModelName,
    predictionTimestamp: Date,
    actual: number | string
  ): void {
    const run = this.shadowRuns.get(modelName);
    if (!run) return;

    const pred = run.predictions.find(
      p => Math.abs(p.timestamp.getTime() - predictionTimestamp.getTime()) < 60_000
    );
    if (!pred) return;

    pred.actual = actual;
    pred.correct = this.isCorrect(modelName, pred.prediction, actual);
  }

  // ── Evaluate & promote ─────────────────────────────────────────────────────

  /**
   * Evaluate shadow run metrics after 7 days.
   * Promotes to production if metrics pass gate; discards otherwise.
   */
  async evaluateAndPromote(modelName: ModelName): Promise<ShadowRunStats | null> {
    const run = this.shadowRuns.get(modelName);
    if (!run) {
      logger.warn(`[Shadow] No shadow run found for ${modelName}`);
      return null;
    }

    const stats = this.computeStats(modelName, run);

    logger.info(`[Shadow] Evaluating ${modelName} v${run.version.version}`);
    logger.info(`[Shadow] Stats: ${JSON.stringify({
      days: stats.daysElapsed.toFixed(1),
      predictions: stats.totalPredictions,
      accuracy: (stats.accuracy * 100).toFixed(1) + '%',
    })}`);

    const gate = SHADOW_GATES[modelName](stats);
    stats.passesGate = gate.pass;
    stats.gateDetails = gate.reason;

    if (gate.pass) {
      logger.info(`[Shadow] ✅ ${modelName} PASSES gate: ${gate.reason}`);
      await this.onAlert(`✅ Shadow evaluation passed: ${modelName} v${run.version.version.slice(0, 10)} — ${gate.reason}. Promoting to production.`);
      await this.onPromote(modelName, run.version.version);
    } else {
      logger.warn(`[Shadow] ❌ ${modelName} FAILS gate: ${gate.reason}`);
      await this.onAlert(`❌ Shadow evaluation failed: ${modelName} v${run.version.version.slice(0, 10)} — ${gate.reason}. Discarding.`);
      await this.onDiscard(modelName, run.version.version, gate.reason);
    }

    this.shadowRuns.delete(modelName);
    return stats;
  }

  // ── Manual controls ────────────────────────────────────────────────────────

  /** Force early evaluation (e.g. if model is performing badly during shadow) */
  async forceEvaluate(modelName: ModelName): Promise<ShadowRunStats | null> {
    const run = this.shadowRuns.get(modelName);
    if (!run) return null;
    if (run.promotionTimer) clearTimeout(run.promotionTimer);
    return this.evaluateAndPromote(modelName);
  }

  /** Cancel shadow run without promoting (e.g. emergency rollback) */
  cancelShadowRun(modelName: ModelName): void {
    const run = this.shadowRuns.get(modelName);
    if (!run) return;
    if (run.promotionTimer) clearTimeout(run.promotionTimer);
    this.shadowRuns.delete(modelName);
    logger.warn(`[Shadow] Cancelled shadow run for ${modelName}`);
  }

  /** Check if a model is currently in shadow deployment */
  isInShadow(modelName: ModelName): boolean {
    return this.shadowRuns.has(modelName);
  }

  /** Get current stats for an active shadow run */
  getShadowStats(modelName: ModelName): ShadowRunStats | null {
    const run = this.shadowRuns.get(modelName);
    if (!run) return null;
    return this.computeStats(modelName, run);
  }

  /** Get all active shadow runs summary */
  getAllShadowStatus(): Record<string, { version: string; daysElapsed: number; predictions: number }> {
    const result: Record<string, { version: string; daysElapsed: number; predictions: number }> = {};
    for (const [name, run] of this.shadowRuns) {
      const elapsed = (Date.now() - run.startedAt.getTime()) / (24 * 3_600_000);
      result[name] = {
        version: run.version.version.slice(0, 10),
        daysElapsed: Math.round(elapsed * 10) / 10,
        predictions: run.predictions.length,
      };
    }
    return result;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private computeStats(
    modelName: ModelName,
    run: { version: ModelVersion; startedAt: Date; predictions: ShadowPrediction[] }
  ): ShadowRunStats {
    const elapsed = (Date.now() - run.startedAt.getTime()) / (24 * 3_600_000);
    const evaluated = run.predictions.filter(p => p.correct !== undefined);
    const correct = evaluated.filter(p => p.correct).length;
    const accuracy = evaluated.length > 0 ? correct / evaluated.length : 0;

    // Model-specific metrics
    let precision: number | undefined;
    let rmse: number | undefined;
    let winRate: number | undefined;

    if (modelName === 'price_trend_classifier') {
      // Precision for bullish class
      const bullishPred = evaluated.filter(p => p.prediction === 'bullish');
      const truePositive = bullishPred.filter(p => p.actual === 'bullish').length;
      precision = bullishPred.length > 0 ? truePositive / bullishPred.length : 0;
    }

    if (modelName === 'volatility_forecaster') {
      const errors = evaluated
        .filter(p => typeof p.prediction === 'number' && typeof p.actual === 'number')
        .map(p => Math.pow((p.prediction as number) - (p.actual as number), 2));
      if (errors.length > 0) {
        rmse = Math.sqrt(errors.reduce((s, e) => s + e, 0) / errors.length);
      }
    }

    if (modelName === 'strategy_selector') {
      // Win rate: fraction of strategy predictions that were profitable
      // (simplified: if model predicted correct strategy for profitable trade)
      winRate = accuracy; // in practice, link to actual trade PnL
    }

    return {
      modelName,
      shadowVersion: run.version.version,
      startedAt: run.startedAt,
      daysElapsed: elapsed,
      totalPredictions: run.predictions.length,
      correctPredictions: correct,
      accuracy,
      precision,
      rmse,
      winRate,
      passesGate: false, // computed by caller
      gateDetails: '',
    };
  }

  private isCorrect(
    modelName: ModelName,
    prediction: number | string,
    actual: number | string
  ): boolean {
    switch (modelName) {
      case 'volume_predictor': {
        // Within 20% of actual
        const p = prediction as number, a = actual as number;
        return a !== 0 && Math.abs(p - a) / Math.abs(a) < 0.20;
      }
      case 'price_trend_classifier':
        return prediction === actual;
      case 'volatility_forecaster': {
        // RMSE < 5%
        const p = prediction as number, a = actual as number;
        return Math.abs(p - a) < 0.05;
      }
      case 'strategy_selector':
        return prediction === actual;
      default:
        return false;
    }
  }

  stop(): void {
    for (const run of this.shadowRuns.values()) {
      if (run.promotionTimer) clearTimeout(run.promotionTimer);
    }
    this.shadowRuns.clear();
  }
}
