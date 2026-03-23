/**
 * DisasterRecovery.ts
 * BRD v3 §7 — Disaster Recovery: position protection protocol + Dead Man's Switch.
 * NEW in v3.0: 6-step crash recovery sequence, safe mode, heartbeat to Redis.
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecoveryStep =
  | 'state_recovery'
  | 'price_validation'
  | 'risk_assessment'
  | 'safe_mode_check'
  | 'notification'
  | 'resume';

export interface PositionSnapshot {
  id: string;
  poolAddress: string;
  entryPrice: number;
  currentPrice: number;
  pnlPercentage: number;
  impermanentLoss: number;
  status: string;
}

export interface RecoveryResult {
  success: boolean;
  steps: Array<{ step: RecoveryStep; status: 'ok' | 'failed' | 'skipped'; detail: string }>;
  positionsRecovered: number;
  positionsAtRisk: number;
  safeMode: boolean;
  durationMs: number;
}

export interface DrDeps {
  getActivePositionsFromDB: () => Promise<PositionSnapshot[]>;
  getCurrentPrices: (pools: string[]) => Promise<Map<string, number>>;
  exitPosition: (id: string, reason: string) => Promise<void>;
  pauseNewEntries: () => void;
  resumeNormalOperation: () => void;
  sendTelegramAlert: (message: string) => Promise<void>;
  publishHeartbeat: () => Promise<void>;
  getRedisHeartbeatAge: () => Promise<number>; // seconds since last heartbeat
}

// ─── DisasterRecovery ─────────────────────────────────────────────────────────

export class DisasterRecovery {
  private deps: DrDeps;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private inSafeMode = false;
  private startedAt = new Date();

  // BRD v3 constants
  private readonly HEARTBEAT_INTERVAL_MS = 60_000;   // publish every 60s
  private readonly STOP_LOSS_PCT = 0.03;             // 3% stop loss
  private readonly IL_THRESHOLD = 0.05;              // 5% IL threshold (circuit breaker)
  private readonly SAFE_MODE_POSITIONS_THRESHOLD = 2; // >2 at-risk → safe mode

  constructor(deps: DrDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.deps.publishHeartbeat();
        logger.debug('[DisasterRecovery] Heartbeat published');
      } catch (err) {
        logger.error('[DisasterRecovery] Failed to publish heartbeat:', err);
      }
    }, this.HEARTBEAT_INTERVAL_MS);

    logger.info('[DisasterRecovery] Heartbeat started (60s interval)');
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isInSafeMode(): boolean { return this.inSafeMode; }

  // ── §7.2 Crash Recovery — 6-step sequence ─────────────────────────────────

  async executeStartupRecovery(): Promise<RecoveryResult> {
    const t0 = Date.now();
    const steps: RecoveryResult['steps'] = [];
    let positionsRecovered = 0;
    let positionsAtRisk = 0;

    logger.info('[DisasterRecovery] === Starting crash recovery sequence ===');

    // ─ Step 1: State Recovery ─────────────────────────────────────────────
    let positions: PositionSnapshot[] = [];
    try {
      positions = await this.deps.getActivePositionsFromDB();
      positionsRecovered = positions.length;
      steps.push({ step: 'state_recovery', status: 'ok', detail: `Recovered ${positions.length} active positions from PostgreSQL` });
      logger.info(`[DisasterRecovery] Step 1 OK: ${positions.length} positions loaded`);
    } catch (err) {
      steps.push({ step: 'state_recovery', status: 'failed', detail: `DB read failed: ${err}` });
      logger.error('[DisasterRecovery] Step 1 FAILED — cannot continue without position data');
      return { success: false, steps, positionsRecovered: 0, positionsAtRisk: 0, safeMode: true, durationMs: Date.now() - t0 };
    }

    // ─ Step 2: Price Validation ───────────────────────────────────────────
    try {
      const pools = positions.map(p => p.poolAddress);
      const prices = await this.deps.getCurrentPrices(pools);

      for (const pos of positions) {
        const price = prices.get(pos.poolAddress);
        if (price) pos.currentPrice = price;
      }

      steps.push({ step: 'price_validation', status: 'ok', detail: `Fetched current prices for ${pools.length} pools via fallback RPC` });
      logger.info('[DisasterRecovery] Step 2 OK: prices validated');
    } catch (err) {
      steps.push({ step: 'price_validation', status: 'failed', detail: `Price fetch failed: ${err}` });
      logger.warn('[DisasterRecovery] Step 2 FAILED — proceeding with last known prices');
    }

    // ─ Step 3: Risk Assessment ────────────────────────────────────────────
    const atRiskPositions: PositionSnapshot[] = [];
    try {
      for (const pos of positions) {
        const isOverStopLoss = pos.pnlPercentage < -this.STOP_LOSS_PCT;
        const isOverIL = pos.impermanentLoss > this.IL_THRESHOLD;

        if (isOverStopLoss || isOverIL) {
          atRiskPositions.push(pos);
          logger.warn(`[DisasterRecovery] Position AT RISK: ${pos.id} (pnl=${pos.pnlPercentage.toFixed(2)}% IL=${(pos.impermanentLoss * 100).toFixed(2)}%)`);
        }
      }

      positionsAtRisk = atRiskPositions.length;
      steps.push({ step: 'risk_assessment', status: 'ok', detail: `${positionsAtRisk} positions at risk (stop-loss or IL threshold exceeded)` });
    } catch (err) {
      steps.push({ step: 'risk_assessment', status: 'failed', detail: `Risk assessment failed: ${err}` });
    }

    // ─ Step 4: Safe Mode Check ────────────────────────────────────────────
    if (positionsAtRisk > this.SAFE_MODE_POSITIONS_THRESHOLD) {
      this.inSafeMode = true;
      this.deps.pauseNewEntries();
      steps.push({ step: 'safe_mode_check', status: 'ok', detail: `SAFE MODE ACTIVATED: ${positionsAtRisk} at-risk positions > threshold of ${this.SAFE_MODE_POSITIONS_THRESHOLD}. No new entries until resolved.` });
      logger.warn('[DisasterRecovery] Step 4: SAFE MODE ACTIVATED');

      // Exit positions that exceed thresholds
      for (const pos of atRiskPositions) {
        try {
          await this.deps.exitPosition(pos.id, `Recovery: position at risk (pnl=${pos.pnlPercentage.toFixed(2)}%)`);
          logger.info(`[DisasterRecovery] Exited at-risk position: ${pos.id}`);
        } catch (err) {
          logger.error(`[DisasterRecovery] Failed to exit position ${pos.id}:`, err);
        }
      }
    } else {
      steps.push({ step: 'safe_mode_check', status: 'ok', detail: `Normal mode: ${positionsAtRisk} at-risk positions below threshold` });
    }

    // ─ Step 5: Notification ───────────────────────────────────────────────
    try {
      const snapshot = positions.map(p =>
        `• ${p.poolAddress.slice(0, 8)}... | PnL: ${p.pnlPercentage.toFixed(2)}% | IL: ${(p.impermanentLoss * 100).toFixed(2)}%`
      ).join('\n');

      await this.deps.sendTelegramAlert(
        `🔄 *System Recovery Complete*\n\n` +
        `✅ Positions recovered: ${positionsRecovered}\n` +
        `⚠️ At risk: ${positionsAtRisk}\n` +
        `🛡 Mode: ${this.inSafeMode ? 'SAFE MODE' : 'NORMAL'}\n\n` +
        `*Position Snapshot:*\n${snapshot || 'No active positions'}`
      );

      steps.push({ step: 'notification', status: 'ok', detail: 'Telegram alert sent with position snapshot' });
    } catch (err) {
      steps.push({ step: 'notification', status: 'failed', detail: `Telegram notification failed: ${err}` });
    }

    // ─ Step 6: Resume ─────────────────────────────────────────────────────
    if (!this.inSafeMode) {
      this.deps.resumeNormalOperation();
      steps.push({ step: 'resume', status: 'ok', detail: 'Normal operation resumed — all positions validated' });
    } else {
      steps.push({ step: 'resume', status: 'skipped', detail: 'Resume skipped — safe mode active until at-risk positions resolved' });
    }

    const durationMs = Date.now() - t0;
    logger.info(`[DisasterRecovery] === Recovery complete in ${durationMs}ms. Safe mode: ${this.inSafeMode} ===`);

    return {
      success: true,
      steps,
      positionsRecovered,
      positionsAtRisk,
      safeMode: this.inSafeMode,
      durationMs,
    };
  }

  // ── Safe Mode Management ───────────────────────────────────────────────────

  exitSafeMode(): void {
    this.inSafeMode = false;
    this.deps.resumeNormalOperation();
    logger.info('[DisasterRecovery] Safe mode deactivated — normal operation resumed');
  }

  // ── Dead Man's Switch monitoring ───────────────────────────────────────────
  // Note: The *watchdog* is a separate container (docker-compose service: watchdog).
  // This method is for external callers to check heartbeat age (e.g. health endpoint).

  async getHeartbeatAge(): Promise<number> {
    return this.deps.getRedisHeartbeatAge();
  }

  // ── §7.1 RTO Summary ──────────────────────────────────────────────────────

  getRTOTargets(): Array<{ scenario: string; rto: string; rpo: string; action: string }> {
    return [
      { scenario: 'App server crash',       rto: '< 5 minutes',  rpo: '< 1 minute',  action: 'PM2 auto-restart + startup recovery' },
      { scenario: 'Database corruption',    rto: '< 30 minutes', rpo: '< 1 hour',    action: 'Restore from latest S3 backup' },
      { scenario: 'Full VPS failure',       rto: '< 2 hours',    rpo: '< 4 hours',   action: 'Deploy to standby VPS' },
      { scenario: 'RPC node failure',       rto: '< 30 seconds', rpo: '0 (stateless)', action: 'RpcPoolManager auto-failover' },
      { scenario: 'Private key compromise', rto: '< 10 minutes', rpo: 'Immediate',   action: 'Emergency exit + key rotation' },
      { scenario: 'Smart contract exploit', rto: '< 2 minutes',  rpo: 'Immediate',   action: 'Kill switch: exit all positions' },
    ];
  }
}
