/**
 * ILHedgeService.ts
 * BRD v3 §5 — Impermanent Loss Hedging Strategy.
 * NEW in v3.0: 4 IL tiers (Monitor/Alert/Hedge/Exit) + 4 hedge mechanisms.
 * IL formula: IL = 2 × sqrt(price_ratio) / (1 + price_ratio) - 1
 * Calculated every 60 seconds per active position.
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ILTier = 'monitor' | 'alert' | 'hedge' | 'exit';

export interface ILAssessment {
  positionId: string;
  poolAddress: string;
  ilPercentage: number;   // 0–1 (e.g. 0.032 = 3.2%)
  tier: ILTier;
  priceRatio: number;     // current_price / entry_price
  action: ILAction;
  timestamp: Date;
}

export interface ILAction {
  type: 'none' | 'alert' | 'widen_range' | 'ratio_rebalance' | 'delta_neutral_hedge' | 'exit';
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  description: string;
}

export interface HedgePosition {
  positionId: string;
  hedgeType: 'range_widening' | 'ratio_rebalance' | 'delta_neutral';
  openedAt: Date;
  expiresAt: Date;         // max 24h per BRD
  hedgeSize: number;       // USD
  costBudget: number;      // max 0.5% of position value
  status: 'active' | 'closed' | 'expired';
}

// Injected dependencies — keeps service testable without real blockchain calls
export interface ILHedgeDeps {
  getCurrentPrice: (poolAddress: string) => Promise<number>;
  widenRange: (positionId: string, factor: number) => Promise<void>;
  rebalanceRatio: (positionId: string, targetRatio: number) => Promise<void>;
  exitPosition: (positionId: string, reason: string) => Promise<void>;
  openDeltaNeutralHedge: (positionId: string, hedgeSize: number) => Promise<void>;
  notifyAlert: (assessment: ILAssessment) => Promise<void>;
  logILEvent: (assessment: ILAssessment) => Promise<void>;
}

// ─── IL Tier Thresholds (BRD v3 §5.1) ────────────────────────────────────────
const TIERS = {
  monitor: { min: 0,     max: 0.01 },  // < 1%  — log only
  alert:   { min: 0.01,  max: 0.03 },  // 1–3%  — alert + evaluate rebalance
  hedge:   { min: 0.03,  max: 0.05 },  // 3–5%  — open partial hedge
  exit:    { min: 0.05,  max: Infinity }, // > 5% — exit immediately
};

// ─── ILHedgeService ───────────────────────────────────────────────────────────

export class ILHedgeService {
  private deps: ILHedgeDeps;
  private activeHedges: Map<string, HedgePosition> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private assessmentHistory: ILAssessment[] = [];

  constructor(deps: ILHedgeDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(checkIntervalMs = 60_000): void {
    this.monitorInterval = setInterval(() => {
      logger.debug('[ILHedgeService] Interval tick — call checkPositions() externally');
    }, checkIntervalMs);
    logger.info(`[ILHedgeService] Started. Check interval: ${checkIntervalMs / 1000}s`);
  }

  stop(): void {
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    logger.info('[ILHedgeService] Stopped');
  }

  // ── Core IL Calculation (BRD v3 §5.3) ─────────────────────────────────────

  /**
   * IL = 2 × sqrt(price_ratio) / (1 + price_ratio) - 1
   * Where price_ratio = current_price / entry_price
   */
  calculateIL(entryPrice: number, currentPrice: number): number {
    if (entryPrice <= 0 || currentPrice <= 0) return 0;
    const priceRatio = currentPrice / entryPrice;
    const il = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
    return Math.abs(il); // Always positive — IL is always a loss
  }

  classifyILTier(ilPercentage: number): ILTier {
    if (ilPercentage >= TIERS.exit.min)  return 'exit';
    if (ilPercentage >= TIERS.hedge.min) return 'hedge';
    if (ilPercentage >= TIERS.alert.min) return 'alert';
    return 'monitor';
  }

  // ── Assessment ─────────────────────────────────────────────────────────────

  async assessPosition(params: {
    positionId: string;
    poolAddress: string;
    entryPrice: number;
    capitalUsd: number;
    totalCapitalUsd: number;
    currentTokenRatioA: number;   // 0–1, current allocation to token A
  }): Promise<ILAssessment> {
    const currentPrice = await this.deps.getCurrentPrice(params.poolAddress);
    const priceRatio = currentPrice / params.entryPrice;
    const ilPct = this.calculateIL(params.entryPrice, currentPrice);
    const tier = this.classifyILTier(ilPct);
    const action = this.determineAction(tier, params.positionId, params.capitalUsd, params.totalCapitalUsd, params.currentTokenRatioA);

    const assessment: ILAssessment = {
      positionId: params.positionId,
      poolAddress: params.poolAddress,
      ilPercentage: ilPct,
      tier,
      priceRatio,
      action,
      timestamp: new Date(),
    };

    // Keep rolling history (last 1000)
    this.assessmentHistory.unshift(assessment);
    if (this.assessmentHistory.length > 1000) this.assessmentHistory.pop();

    await this.deps.logILEvent(assessment);
    return assessment;
  }

  // ── Action Determination ───────────────────────────────────────────────────

  private determineAction(
    tier: ILTier,
    positionId: string,
    capitalUsd: number,
    totalCapitalUsd: number,
    currentTokenRatioA: number,
  ): ILAction {
    switch (tier) {
      case 'monitor':
        return { type: 'none', urgency: 'low', description: 'IL within acceptable variance — logging only' };

      case 'alert':
        // BRD Mechanism 1: widen range by 50% if IL in alert tier
        return {
          type: 'widen_range',
          urgency: 'medium',
          description: 'IL 1–3%: widen price range by 50% to absorb further movement',
        };

      case 'hedge': {
        const positionFraction = capitalUsd / totalCapitalUsd;
        const ratioDrift = Math.abs(currentTokenRatioA - 0.5);

        // BRD Mechanism 2: ratio rebalancing if drift > 15% from 50/50
        if (ratioDrift > 0.15) {
          return {
            type: 'ratio_rebalance',
            urgency: 'high',
            description: `IL 3–5%: token ratio drifted ${(ratioDrift * 100).toFixed(1)}% from 50/50 — partial swap to restore balance`,
          };
        }

        // BRD Mechanism 3: delta-neutral hedge if position > 10% of capital
        if (positionFraction > 0.10) {
          return {
            type: 'delta_neutral_hedge',
            urgency: 'high',
            description: `IL 3–5% + position ${(positionFraction * 100).toFixed(1)}% of capital — open delta-neutral hedge on Drift Protocol`,
          };
        }

        // Default: ratio rebalance for smaller positions
        return {
          type: 'ratio_rebalance',
          urgency: 'medium',
          description: 'IL 3–5%: rebalance token ratio to reduce directional exposure',
        };
      }

      case 'exit':
        return {
          type: 'exit',
          urgency: 'immediate',
          description: 'IL > 5%: exceeds stop-loss tolerance — exit position immediately',
        };
    }
  }

  // ── Hedge Execution ────────────────────────────────────────────────────────

  async executeAction(assessment: ILAssessment, capitalUsd: number): Promise<void> {
    const { positionId, action, tier } = assessment;

    logger.info(`[ILHedgeService] Executing IL action: ${action.type} for position ${positionId} (tier=${tier}, IL=${(assessment.ilPercentage * 100).toFixed(2)}%)`);

    switch (action.type) {
      case 'none':
        break;

      case 'widen_range':
        // BRD Mechanism 1: widen by 50%
        await this.deps.widenRange(positionId, 1.5);
        logger.info(`[ILHedgeService] Range widened 50% for ${positionId}`);
        break;

      case 'ratio_rebalance':
        // BRD Mechanism 2: restore to 50/50
        await this.deps.rebalanceRatio(positionId, 0.5);
        logger.info(`[ILHedgeService] Token ratio rebalanced to 50/50 for ${positionId}`);
        break;

      case 'delta_neutral_hedge': {
        // BRD Mechanism 3: hedge size = 30–50% of IL exposure, max cost 0.5% of position
        const ilExposure = capitalUsd * assessment.ilPercentage;
        const hedgeSize = ilExposure * 0.40;  // 40% of IL exposure
        const costBudget = capitalUsd * 0.005; // 0.5% of position value

        if (hedgeSize > costBudget) {
          logger.warn(`[ILHedgeService] Hedge size $${hedgeSize.toFixed(2)} exceeds budget $${costBudget.toFixed(2)} — using budget cap`);
        }

        const effectiveHedge = Math.min(hedgeSize, costBudget);
        await this.deps.openDeltaNeutralHedge(positionId, effectiveHedge);

        const hedge: HedgePosition = {
          positionId,
          hedgeType: 'delta_neutral',
          openedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 3_600_000), // 24h max per BRD
          hedgeSize: effectiveHedge,
          costBudget,
          status: 'active',
        };
        this.activeHedges.set(positionId, hedge);
        logger.info(`[ILHedgeService] Delta-neutral hedge opened: $${effectiveHedge.toFixed(2)} for ${positionId}`);
        break;
      }

      case 'exit':
        // BRD: exit immediately, 1hr cooldown before re-entry
        await this.deps.exitPosition(positionId, `IL exceeded 5% (${(assessment.ilPercentage * 100).toFixed(2)}%)`);
        this.closeHedge(positionId);
        logger.warn(`[ILHedgeService] Position exited due to IL threshold: ${positionId}`);
        break;
    }

    // Always send alert for tier >= alert
    if (tier !== 'monitor') {
      await this.deps.notifyAlert(assessment);
    }
  }

  // ── Hedge Management ───────────────────────────────────────────────────────

  async checkAndExpireHedges(): Promise<void> {
    const now = Date.now();
    for (const [posId, hedge] of this.activeHedges) {
      if (hedge.status === 'active' && now > hedge.expiresAt.getTime()) {
        hedge.status = 'expired';
        logger.info(`[ILHedgeService] Hedge expired for position ${posId} (24h limit)`);
        // In production: close the Drift Protocol position here
      }
    }
  }

  closeHedge(positionId: string): void {
    const hedge = this.activeHedges.get(positionId);
    if (hedge) {
      hedge.status = 'closed';
      this.activeHedges.delete(positionId);
    }
  }

  hasActiveHedge(positionId: string): boolean {
    return this.activeHedges.has(positionId);
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  getILTrend(positionId: string, lastN = 10): ILAssessment[] {
    return this.assessmentHistory
      .filter(a => a.positionId === positionId)
      .slice(0, lastN);
  }

  getActiveHedges(): HedgePosition[] {
    return Array.from(this.activeHedges.values()).filter(h => h.status === 'active');
  }
}
