/**
 * MarketRegimeDetector.ts
 * BRD v3 §6.2 — Market Regime multiplier for graduated position sizing.
 * NEW v3.0: Bull ×1.10, Bear ×0.70, Neutral ×1.00
 * Integrates with RiskManager.calculatePositionSize().
 */

import { logger } from '../utils/logger';

export type MarketRegime = 'bull' | 'neutral' | 'bear';

export interface RegimeSignal {
  regime: MarketRegime;
  multiplier: number;     // 1.10 | 1.00 | 0.70
  confidence: number;     // 0–1
  basis: string;          // human-readable reason
  detectedAt: Date;
}

export interface RegimeInput {
  solPriceChange7d: number;     // 7-day SOL price change (e.g. 0.12 = +12%)
  totalMarketVolume24h: number; // total Meteora volume today vs 7d avg
  avgPoolTVLChange: number;     // avg TVL change across top 20 pools
  fearGreedIndex?: number;      // 0–100 if available (external)
}

// BRD v3 §6.2 multipliers
const MULTIPLIERS: Record<MarketRegime, number> = {
  bull:    1.10,
  neutral: 1.00,
  bear:    0.70,
};

// Detection thresholds
const THRESHOLDS = {
  bull: {
    priceChange7d:       0.05,   // SOL up > 5% in 7d
    volumeRatio:         1.20,   // volume > 120% of 7d avg
    tvlChange:           0.03,   // TVL growing > 3%
  },
  bear: {
    priceChange7d:      -0.05,   // SOL down > 5% in 7d
    volumeRatio:         0.80,   // volume < 80% of 7d avg
    tvlChange:          -0.05,   // TVL dropping > 5%
  },
};

export class MarketRegimeDetector {
  private currentRegime: RegimeSignal;
  private history: RegimeSignal[] = [];

  constructor() {
    this.currentRegime = {
      regime: 'neutral',
      multiplier: 1.00,
      confidence: 0.5,
      basis: 'Default — no data yet',
      detectedAt: new Date(),
    };
  }

  /**
   * Detect market regime from multiple signals.
   * Uses weighted voting: price (40%), volume (35%), TVL (25%).
   */
  detect(input: RegimeInput): RegimeSignal {
    let bullScore = 0;
    let bearScore = 0;

    // Price signal (weight 40%)
    if (input.solPriceChange7d >= THRESHOLDS.bull.priceChange7d) {
      bullScore += 0.40;
    } else if (input.solPriceChange7d <= THRESHOLDS.bear.priceChange7d) {
      bearScore += 0.40;
    }

    // Volume signal (weight 35%)
    const volumeRatio = input.totalMarketVolume24h; // pre-normalized by caller
    if (volumeRatio >= THRESHOLDS.bull.volumeRatio) {
      bullScore += 0.35;
    } else if (volumeRatio <= THRESHOLDS.bear.volumeRatio) {
      bearScore += 0.35;
    }

    // TVL signal (weight 25%)
    if (input.avgPoolTVLChange >= THRESHOLDS.bull.tvlChange) {
      bullScore += 0.25;
    } else if (input.avgPoolTVLChange <= THRESHOLDS.bear.tvlChange) {
      bearScore += 0.25;
    }

    // Optional fear/greed override
    if (input.fearGreedIndex !== undefined) {
      if (input.fearGreedIndex >= 70) bullScore = Math.max(bullScore, 0.60);
      if (input.fearGreedIndex <= 30) bearScore = Math.max(bearScore, 0.60);
    }

    // Determine regime
    let regime: MarketRegime = 'neutral';
    let confidence = 0.5;
    let basis = 'Mixed signals — neutral stance';

    if (bullScore > 0.50) {
      regime = 'bull';
      confidence = Math.min(bullScore, 0.95);
      basis = `Bull: SOL ${(input.solPriceChange7d * 100).toFixed(1)}% 7d, vol ratio ${volumeRatio.toFixed(2)}`;
    } else if (bearScore > 0.50) {
      regime = 'bear';
      confidence = Math.min(bearScore, 0.95);
      basis = `Bear: SOL ${(input.solPriceChange7d * 100).toFixed(1)}% 7d, vol ratio ${volumeRatio.toFixed(2)}`;
    }

    const signal: RegimeSignal = {
      regime,
      multiplier: MULTIPLIERS[regime],
      confidence,
      basis,
      detectedAt: new Date(),
    };

    // Only update if confidence is sufficient (avoid flip-flopping)
    if (confidence >= 0.55 || regime === 'neutral') {
      this.currentRegime = signal;
      this.history.unshift(signal);
      if (this.history.length > 100) this.history.pop();
      logger.info(`[MarketRegime] Detected: ${regime} (conf=${confidence.toFixed(2)}) | ${basis}`);
    } else {
      logger.debug(`[MarketRegime] Low confidence ${confidence.toFixed(2)} — keeping ${this.currentRegime.regime}`);
    }

    return this.currentRegime;
  }

  /**
   * Get current multiplier to apply to position sizing.
   * BRD v3 §6.2: base_size × confidence × risk × age × vol × regime_mult
   */
  getMultiplier(): number {
    return this.currentRegime.multiplier;
  }

  getCurrentRegime(): RegimeSignal {
    return this.currentRegime;
  }

  getHistory(last = 10): RegimeSignal[] {
    return this.history.slice(0, last);
  }

  /**
   * Apply BRD v3 §6.2 market regime multiplier to existing position size.
   */
  applyToPositionSize(baseSize: number): number {
    const adjusted = baseSize * this.currentRegime.multiplier;
    logger.debug(`[MarketRegime] Position size: ${baseSize.toFixed(4)} × ${this.currentRegime.multiplier} (${this.currentRegime.regime}) = ${adjusted.toFixed(4)}`);
    return adjusted;
  }
}
