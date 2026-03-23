/**
 * CircuitBreakerService.ts
 * BRD v3 §6.1 — 7 circuit breakers with auto-reset conditions.
 * NEW in v3.0: adds 7th breaker (IL > 5%) + auto-reset logic per breaker.
 * v2 had 6 breakers with no reset conditions.
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BreakerName =
  | 'daily_loss'
  | 'max_drawdown'
  | 'gas_spike'
  | 'tvl_crash'
  | 'volatility_spike'
  | 'api_failure'
  | 'il_threshold';   // NEW v3.0 — 7th circuit breaker

export interface BreakerState {
  name: BreakerName;
  triggered: boolean;
  triggeredAt: Date | null;
  triggeredValue: number;
  resetCondition: string;
  autoResetable: boolean;
  action: string;
}

export interface BreakerCheckResult {
  name: BreakerName;
  triggered: boolean;
  value: number;
  threshold: number;
  action?: string;
}

// ─── BRD v3 §6.1 Breaker Definitions ─────────────────────────────────────────
// Each includes threshold, action, and reset condition (new in v3.0)

const BREAKER_DEFS: Record<BreakerName, {
  threshold: number;
  unit: string;
  action: string;
  resetCondition: string;
  autoResetable: boolean;
}> = {
  daily_loss: {
    threshold: 0.05,
    unit: 'portfolio fraction',
    action: 'Stop all new entries',
    resetCondition: 'Manual reset after review',
    autoResetable: false,
  },
  max_drawdown: {
    threshold: 0.10,
    unit: 'portfolio fraction',
    action: 'Emergency exit all positions',
    resetCondition: 'Manual reset + audit required',
    autoResetable: false,
  },
  gas_spike: {
    threshold: 0.01,
    unit: 'SOL per tx',
    action: 'Pause trading',
    resetCondition: 'Auto-resume when gas < 0.005 SOL',
    autoResetable: true,
  },
  tvl_crash: {
    threshold: 0.30,
    unit: 'TVL drop fraction in 1hr',
    action: 'Exit pool immediately',
    resetCondition: 'Pool removed from whitelist for 48hr',
    autoResetable: false,
  },
  volatility_spike: {
    threshold: 3.0,
    unit: 'multiple of normal volatility',
    action: 'Reduce position sizes 50%',
    resetCondition: 'Auto-resume when volatility normalizes',
    autoResetable: true,
  },
  api_failure: {
    threshold: 3,
    unit: 'consecutive failures',
    action: 'Pause and alert',
    resetCondition: 'Auto-retry with backoff; manual after 5',
    autoResetable: true,
  },
  il_threshold: {                           // NEW v3.0 — 7th breaker
    threshold: 0.05,
    unit: 'IL fraction',
    action: 'Exit position immediately',
    resetCondition: 'Re-entry allowed after 1hr cooldown',
    autoResetable: true,
  },
};

// ─── CircuitBreakerService ────────────────────────────────────────────────────

export class CircuitBreakerService {
  private states: Map<BreakerName, BreakerState> = new Map();
  private apiFailureCount = 0;
  private normalVolatility: number | null = null;

  // Injected callbacks
  private onTrigger: (name: BreakerName, action: string, value: number) => Promise<void>;

  constructor(onTrigger: (name: BreakerName, action: string, value: number) => Promise<void>) {
    this.onTrigger = onTrigger;
    this.initializeStates();
  }

  private initializeStates(): void {
    for (const [name, def] of Object.entries(BREAKER_DEFS) as [BreakerName, typeof BREAKER_DEFS[BreakerName]][]) {
      this.states.set(name, {
        name,
        triggered: false,
        triggeredAt: null,
        triggeredValue: 0,
        resetCondition: def.resetCondition,
        autoResetable: def.autoResetable,
        action: def.action,
      });
    }
  }

  // ── Check Methods ──────────────────────────────────────────────────────────

  async checkDailyLoss(lossFraction: number): Promise<BreakerCheckResult> {
    return this.evaluate('daily_loss', lossFraction, BREAKER_DEFS.daily_loss.threshold);
  }

  async checkMaxDrawdown(drawdownFraction: number): Promise<BreakerCheckResult> {
    return this.evaluate('max_drawdown', drawdownFraction, BREAKER_DEFS.max_drawdown.threshold);
  }

  async checkGasPrice(gasSol: number): Promise<BreakerCheckResult> {
    const result = this.evaluate('gas_spike', gasSol, BREAKER_DEFS.gas_spike.threshold);

    // Auto-reset: gas < 0.005 SOL
    const state = this.states.get('gas_spike')!;
    if (state.triggered && gasSol < 0.005) {
      this.resetBreaker('gas_spike');
      logger.info('[CircuitBreaker] gas_spike auto-reset: gas normalized');
    }

    return result;
  }

  async checkTvlDrop(currentTvl: number, previousTvl: number): Promise<BreakerCheckResult> {
    const dropFraction = previousTvl > 0 ? (previousTvl - currentTvl) / previousTvl : 0;
    return this.evaluate('tvl_crash', dropFraction, BREAKER_DEFS.tvl_crash.threshold);
  }

  async checkVolatility(currentVol: number): Promise<BreakerCheckResult> {
    // Establish baseline on first call
    if (this.normalVolatility === null) {
      this.normalVolatility = currentVol;
      return { name: 'volatility_spike', triggered: false, value: 1, threshold: BREAKER_DEFS.volatility_spike.threshold };
    }

    const multiple = this.normalVolatility > 0 ? currentVol / this.normalVolatility : 1;
    const result = this.evaluate('volatility_spike', multiple, BREAKER_DEFS.volatility_spike.threshold);

    // Auto-reset: volatility back to normal
    const state = this.states.get('volatility_spike')!;
    if (state.triggered && multiple < 1.5) {
      this.resetBreaker('volatility_spike');
      logger.info('[CircuitBreaker] volatility_spike auto-reset: volatility normalized');
    }

    // Update rolling baseline (slow EMA)
    this.normalVolatility = this.normalVolatility * 0.95 + currentVol * 0.05;

    return result;
  }

  async checkApiFailure(failed: boolean): Promise<BreakerCheckResult> {
    if (failed) {
      this.apiFailureCount++;
    } else {
      // Auto-reset on success (backoff recovery)
      if (this.apiFailureCount > 0) this.apiFailureCount = Math.max(0, this.apiFailureCount - 1);
      const state = this.states.get('api_failure')!;
      if (state.triggered && this.apiFailureCount < BREAKER_DEFS.api_failure.threshold) {
        this.resetBreaker('api_failure');
        logger.info('[CircuitBreaker] api_failure auto-reset: API recovered');
      }
    }

    return this.evaluate('api_failure', this.apiFailureCount, BREAKER_DEFS.api_failure.threshold);
  }

  // NEW v3.0 — 7th circuit breaker
  async checkILThreshold(ilFraction: number): Promise<BreakerCheckResult> {
    const result = this.evaluate('il_threshold', ilFraction, BREAKER_DEFS.il_threshold.threshold);

    // Auto-reset after 1hr cooldown
    const state = this.states.get('il_threshold')!;
    if (state.triggered && state.triggeredAt) {
      const hoursSince = (Date.now() - state.triggeredAt.getTime()) / 3_600_000;
      if (hoursSince >= 1.0 && ilFraction < BREAKER_DEFS.il_threshold.threshold) {
        this.resetBreaker('il_threshold');
        logger.info('[CircuitBreaker] il_threshold auto-reset: 1hr cooldown elapsed');
      }
    }

    return result;
  }

  // ── Evaluate + Trigger ─────────────────────────────────────────────────────

  private async evaluate(
    name: BreakerName,
    value: number,
    threshold: number,
  ): Promise<BreakerCheckResult> {
    const state = this.states.get(name)!;
    const def = BREAKER_DEFS[name];

    if (!state.triggered && value >= threshold) {
      state.triggered = true;
      state.triggeredAt = new Date();
      state.triggeredValue = value;

      logger.warn(`[CircuitBreaker] TRIGGERED: ${name} | value=${value.toFixed(4)} >= threshold=${threshold}`);
      await this.onTrigger(name, def.action, value);
    }

    return { name, triggered: state.triggered, value, threshold, action: def.action };
  }

  // ── Manual & Auto Reset ────────────────────────────────────────────────────

  resetBreaker(name: BreakerName): void {
    const state = this.states.get(name);
    if (!state) return;

    state.triggered = false;
    state.triggeredAt = null;
    state.triggeredValue = 0;
    logger.info(`[CircuitBreaker] Reset: ${name}`);
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  isTriggered(name: BreakerName): boolean {
    return this.states.get(name)?.triggered ?? false;
  }

  getActiveBreakers(): BreakerState[] {
    return Array.from(this.states.values()).filter(s => s.triggered);
  }

  getAllStates(): BreakerState[] {
    return Array.from(this.states.values());
  }

  isAnyTriggered(): boolean {
    return Array.from(this.states.values()).some(s => s.triggered);
  }
}
