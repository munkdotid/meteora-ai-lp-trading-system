/**
 * RebalanceEngine.ts
 * Standalone auto-rebalance service per BRD section 7.
 * Gap fix: Previously embedded inside TradingEngine. Now a dedicated,
 * independently testable service with all 4 BRD trigger types.
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StrategyType = 'Alpha' | 'Range' | 'Momentum';
export type RebalanceAction = 'REBALANCE_IMMEDIATE' | 'EXPAND_RANGE' | 'REBALANCE_OPTIONAL' | 'HOLD';

export interface Range {
  lower: number;
  upper: number;
}

export interface Position {
  id: string;
  poolAddress: string;
  strategy: StrategyType;
  entryPrice: number;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  pnlPercentage: number;
  impermanentLoss: number;
  lastRebalance: Date | null;
  status: string;
}

export interface RebalanceDecision {
  action: RebalanceAction;
  reason: string;
  urgency: 'immediate' | 'scheduled' | 'optional';
  newRange?: Range;
}

export interface RebalanceReceipt {
  positionId: string;
  action: RebalanceAction;
  reason: string;
  oldRange: Range;
  newRange: Range;
  cost: number;
  timestamp: Date;
}

// External dependencies injected to keep service testable
export interface RebalanceEngineDeps {
  getCurrentPrice: (poolAddress: string) => Promise<number>;
  getVolatility: (poolAddress: string, hours: number) => Promise<number>;
  executeRebalance: (position: Position, newRange: Range) => Promise<{ cost: number }>;
  notifyRebalance: (receipt: RebalanceReceipt) => Promise<void>;
  logRebalance: (receipt: RebalanceReceipt) => Promise<void>;
}

// ─── RebalanceEngine ──────────────────────────────────────────────────────────

export class RebalanceEngine {
  private deps: RebalanceEngineDeps;
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;

  // BRD section 7.3 — Range width strategies
  private readonly RANGE_CONFIGS = {
    narrow: { width: 0.05, label: 'Narrow ±5%' },
    medium: { width: 0.15, label: 'Medium ±15%' },
    wide:   { width: 0.30, label: 'Wide ±30%' },
  };

  // BRD section 7.1 — Rebalance triggers
  private readonly TRIGGERS = {
    profitTarget:     0.05,   // 5% PnL → optional rebalance
    ilThreshold:      0.03,   // 3% IL → alert + rebalance
    timeBasedHours:   4,      // Every 4h → evaluate
    volatilityMultiple: 2.0,  // 2× normal volatility → expand range
    rangeExpandFactor: 1.3,   // 30% wider than current → expand
  };

  constructor(deps: RebalanceEngineDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(intervalMs: number = 180_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      logger.debug('[RebalanceEngine] Interval check tick');
    }, intervalMs);
    logger.info('[RebalanceEngine] Started. Check interval:', intervalMs / 1000, 's');
  }

  stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('[RebalanceEngine] Stopped');
  }

  // ── Check Logic ────────────────────────────────────────────────────────────

  /**
   * Evaluate all active positions and return decisions.
   */
  async checkAllPositions(positions: Position[]): Promise<RebalanceDecision[]> {
    const decisions: RebalanceDecision[] = [];

    for (const position of positions) {
      if (position.status !== 'active') continue;
      try {
        const decision = await this.checkPosition(position);
        decisions.push(decision);
      } catch (err) {
        logger.error(`[RebalanceEngine] Error checking position ${position.id}:`, err);
        decisions.push({ action: 'HOLD', reason: 'check_error', urgency: 'optional' });
      }
    }

    return decisions;
  }

  /**
   * Check a single position against all BRD rebalance triggers.
   */
  async checkPosition(position: Position): Promise<RebalanceDecision> {
    const currentPrice = await this.deps.getCurrentPrice(position.poolAddress);
    const updatedPosition = { ...position, currentPrice };

    // 1. Out of range — immediate rebalance (BRD trigger #1)
    if (!this.isInRange(currentPrice, position.rangeLower, position.rangeUpper)) {
      const volatility = await this.deps.getVolatility(position.poolAddress, 24);
      const newRange = this.calculateOptimalRange(currentPrice, position.strategy, volatility);
      return {
        action: 'REBALANCE_IMMEDIATE',
        reason: 'OUT_OF_RANGE',
        urgency: 'immediate',
        newRange,
      };
    }

    // 2. Profit target reached (BRD trigger #2)
    if (position.pnlPercentage > this.TRIGGERS.profitTarget) {
      const volatility = await this.deps.getVolatility(position.poolAddress, 24);
      const newRange = this.calculateOptimalRange(currentPrice, position.strategy, volatility);
      return {
        action: 'REBALANCE_OPTIONAL',
        reason: 'PROFIT_TARGET',
        urgency: 'optional',
        newRange,
      };
    }

    // 3. IL threshold exceeded (BRD trigger #3)
    if (position.impermanentLoss > this.TRIGGERS.ilThreshold) {
      const volatility = await this.deps.getVolatility(position.poolAddress, 24);
      const newRange = this.calculateOptimalRange(currentPrice, position.strategy, volatility);
      return {
        action: 'REBALANCE_IMMEDIATE',
        reason: 'IL_THRESHOLD_EXCEEDED',
        urgency: 'immediate',
        newRange,
      };
    }

    // 4. Volatility spike — expand range (BRD trigger #5 combined with time-based)
    const volatility24h = await this.deps.getVolatility(position.poolAddress, 24);
    const volatility1h = await this.deps.getVolatility(position.poolAddress, 1);

    if (volatility1h > volatility24h * this.TRIGGERS.volatilityMultiple) {
      const wideRange = this.calculateRangeForMode(currentPrice, 'wide');
      const currentWidth = (position.rangeUpper - position.rangeLower) / currentPrice;

      if (wideRange.upper - wideRange.lower > (position.rangeUpper - position.rangeLower) * this.TRIGGERS.rangeExpandFactor) {
        return {
          action: 'EXPAND_RANGE',
          reason: 'VOLATILITY_SPIKE',
          urgency: 'scheduled',
          newRange: wideRange,
        };
      }
    }

    // 5. Time-based check (BRD trigger #4)
    if (this.isTimeBasedRebalanceNeeded(position)) {
      const newRange = this.calculateOptimalRange(currentPrice, position.strategy, volatility24h);
      const currentWidth = position.rangeUpper - position.rangeLower;
      const newWidth = newRange.upper - newRange.lower;

      // Only rebalance if new range is significantly different
      if (Math.abs(newWidth - currentWidth) / currentWidth > 0.20) {
        return {
          action: 'REBALANCE_OPTIONAL',
          reason: 'TIME_BASED',
          urgency: 'scheduled',
          newRange,
        };
      }
    }

    return { action: 'HOLD', reason: 'NO_ACTION_NEEDED', urgency: 'optional' };
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Execute a rebalance for a position with the given decision.
   */
  async rebalancePosition(position: Position, decision: RebalanceDecision): Promise<RebalanceReceipt> {
    const newRange = decision.newRange ?? this.calculateFallbackRange(position);

    logger.info(`[RebalanceEngine] Rebalancing ${position.id} — reason: ${decision.reason}`);

    const { cost } = await this.deps.executeRebalance(position, newRange);

    const receipt: RebalanceReceipt = {
      positionId: position.id,
      action: decision.action,
      reason: decision.reason,
      oldRange: { lower: position.rangeLower, upper: position.rangeUpper },
      newRange,
      cost,
      timestamp: new Date(),
    };

    await this.deps.logRebalance(receipt);
    await this.deps.notifyRebalance(receipt);

    logger.info(`[RebalanceEngine] Rebalance complete. New range: ${newRange.lower.toFixed(4)}–${newRange.upper.toFixed(4)}`);
    return receipt;
  }

  // ── Range Calculations ─────────────────────────────────────────────────────

  /**
   * Calculate optimal range based on strategy and current volatility.
   * BRD section 7.3.
   */
  calculateOptimalRange(currentPrice: number, strategy: StrategyType, volatility: number): Range {
    let mode: 'narrow' | 'medium' | 'wide';

    if (strategy === 'Alpha') {
      // Small-cap high volume — use narrow for fee maximisation
      mode = volatility < 0.15 ? 'narrow' : 'medium';
    } else if (strategy === 'Range') {
      // Sideways market — medium is ideal
      mode = volatility < 0.25 ? 'medium' : 'wide';
    } else {
      // Momentum — wider to capture trend
      mode = volatility < 0.30 ? 'medium' : 'wide';
    }

    // Override to wide if volatility is very high
    if (volatility > 0.40) mode = 'wide';

    return this.calculateRangeForMode(currentPrice, mode);
  }

  calculateRangeWidth(volatility: number, strategy: StrategyType): number {
    if (volatility > 0.40) return this.RANGE_CONFIGS.wide.width;
    if (strategy === 'Alpha' && volatility < 0.15) return this.RANGE_CONFIGS.narrow.width;
    if (strategy === 'Range') return this.RANGE_CONFIGS.medium.width;
    return this.RANGE_CONFIGS.medium.width;
  }

  private calculateRangeForMode(price: number, mode: 'narrow' | 'medium' | 'wide'): Range {
    const width = this.RANGE_CONFIGS[mode].width;
    return {
      lower: price * (1 - width),
      upper: price * (1 + width),
    };
  }

  private calculateFallbackRange(position: Position): Range {
    const mid = (position.rangeLower + position.rangeUpper) / 2;
    const halfWidth = (position.rangeUpper - position.rangeLower) / 2;
    return { lower: mid - halfWidth, upper: mid + halfWidth };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isInRange(price: number, lower: number, upper: number): boolean {
    return price >= lower && price <= upper;
  }

  private isTimeBasedRebalanceNeeded(position: Position): boolean {
    if (!position.lastRebalance) return false;
    const hoursSince = (Date.now() - position.lastRebalance.getTime()) / 3_600_000;
    return hoursSince >= this.TRIGGERS.timeBasedHours;
  }
}
