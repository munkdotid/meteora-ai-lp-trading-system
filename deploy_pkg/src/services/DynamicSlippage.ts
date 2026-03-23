/**
 * DynamicSlippage.ts
 * BRD v3 §4.2 — Dynamic slippage model.
 * BRD v3 §4.3 — Full fee stack + break-even rebalance check.
 * NEW in v3.0: replaces fixed 50bps with composite formula.
 *
 * Formula: slippage_bps = base_bps + volatility_adj + depth_adj + time_adj
 * Hard cap: min(result, 200 bps) — never exceed 2%
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlippageInput {
  vol15min: number;       // std dev of price over last 15 minutes (0–1)
  tvlUsd: number;         // current pool TVL in USD
  timestampUtc?: Date;    // defaults to now
}

export interface SlippageResult {
  bps: number;            // final slippage in basis points (≤200)
  pct: number;            // as percentage (≤2%)
  breakdown: {
    base: number;
    volatilityAdj: number;
    depthAdj: number;
    timeAdj: number;
  };
}

export interface FeeStackEstimate {
  lpFeeEarned: number;       // estimated LP fee revenue (USD)
  meteoraProtocolFee: number; // 10–20% of LP fee (deducted automatically)
  jupiterSwapFee: number;    // 0.1–0.3% per swap (2× per rebalance round-trip)
  solanaGas: number;         // SOL gas in USD
  jitoTip: number;           // Jito MEV tip in USD
  totalCost: number;         // sum of all costs
  netYield: number;          // lpFeeEarned - totalCost
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  reason: string;
  projectedFees24h: number;
  rebalanceCost: number;
  breakEvenRatio: number;    // projectedFees / rebalanceCost (need ≥ 2.0)
}

// ─── DynamicSlippage ──────────────────────────────────────────────────────────

export class DynamicSlippage {
  // BRD v3 §4.2 constants
  private readonly BASE_BPS = 50;
  private readonly MAX_BPS = 200;
  private readonly PEAK_HOURS_UTC_START = 14; // 14:00 UTC
  private readonly PEAK_HOURS_UTC_END = 22;   // 22:00 UTC
  private readonly PEAK_HOURS_ADJ = 20;       // +20 bps during peak MEV activity

  // BRD v3 §4.3 fee constants
  private readonly METEORA_PROTOCOL_FEE_RATE = 0.15; // 15% of LP fees (midpoint 10–20%)
  private readonly JUPITER_SWAP_FEE_PCT = 0.002;      // 0.2% per swap
  private readonly JITO_TIP_SOL = 0.0001;
  private readonly MAX_GAS_SOL = 0.01;
  private readonly SOL_USD_PRICE: number;

  constructor(solUsdPrice = 150) {
    this.SOL_USD_PRICE = solUsdPrice;
  }

  // ── §4.2 Dynamic Slippage Formula ─────────────────────────────────────────

  calculate(input: SlippageInput): SlippageResult {
    const base = this.BASE_BPS;

    // volatility_adj = vol_15min × 200
    const volatilityAdj = Math.round(input.vol15min * 200);

    // depth_adj = max(0, 100 - depth_score)
    // depth_score = ln(TVL / 100000) × 10, capped at 100
    const depthScore = Math.min(100, Math.log(input.tvlUsd / 100_000) * 10);
    const depthAdj = Math.max(0, Math.round(100 - depthScore));

    // time_adj = +20 if peak hours UTC 14:00–22:00, else 0
    const now = input.timestampUtc ?? new Date();
    const hourUtc = now.getUTCHours();
    const timeAdj = (hourUtc >= this.PEAK_HOURS_UTC_START && hourUtc < this.PEAK_HOURS_UTC_END)
      ? this.PEAK_HOURS_ADJ
      : 0;

    const raw = base + volatilityAdj + depthAdj + timeAdj;
    // Hard cap: never exceed 200 bps
    const bps = Math.min(raw, this.MAX_BPS);

    logger.debug(`[DynamicSlippage] base=${base} vol=${volatilityAdj} depth=${depthAdj} time=${timeAdj} → ${bps}bps`);

    return {
      bps,
      pct: bps / 10_000,
      breakdown: { base, volatilityAdj, depthAdj, timeAdj },
    };
  }

  // ── §4.3 Full Fee Stack Estimation ────────────────────────────────────────

  estimateFeeStack(params: {
    positionUsd: number;
    poolFeeRatePct: number;      // e.g. 0.003 = 0.3% fee tier
    expectedVolumeUsd24h: number;
    positionTvlShare: number;    // fraction of pool this position represents (0–1)
    numSwapsForRebalance?: number; // default 2 (entry swap + exit swap)
  }): FeeStackEstimate {
    const swaps = params.numSwapsForRebalance ?? 2;

    // LP fee earned = volume × pool_fee_rate × position_share
    const lpFeeEarned = params.expectedVolumeUsd24h
      * params.poolFeeRatePct
      * params.positionTvlShare;

    // Meteora protocol fee = 15% of LP fees (deducted automatically from fees)
    const meteoraProtocolFee = lpFeeEarned * this.METEORA_PROTOCOL_FEE_RATE;

    // Jupiter swap fee = 0.2% per swap × number of swaps × half position size
    // (swap half of position value to get 50/50 split)
    const jupiterSwapFee = (params.positionUsd / 2) * this.JUPITER_SWAP_FEE_PCT * swaps;

    // Gas: max 0.01 SOL per tx × ~4 txs per rebalance (remove, swap, add, fee claim)
    const solanaGas = this.MAX_GAS_SOL * 4 * this.SOL_USD_PRICE;

    // Jito tip: 0.0001 SOL per bundle × 2 bundles (entry + exit)
    const jitoTip = this.JITO_TIP_SOL * 2 * this.SOL_USD_PRICE;

    const totalCost = meteoraProtocolFee + jupiterSwapFee + solanaGas + jitoTip;
    const netYield = lpFeeEarned - totalCost;

    return {
      lpFeeEarned,
      meteoraProtocolFee,
      jupiterSwapFee,
      solanaGas,
      jitoTip,
      totalCost,
      netYield,
    };
  }

  // ── §4.3 Break-Even Rebalance Check ───────────────────────────────────────

  /**
   * BRD v3 §4.3: A rebalance is only profitable if projected 24h fee gain
   * from new range > 2× rebalance round-trip cost.
   * If projected_fees < 2× rebalance_cost → action = HOLD.
   */
  checkRebalanceBreakEven(params: {
    projectedFees24h: number;    // expected fees with new range
    currentFees24h: number;      // current fees with old range
    rebalanceCost: number;       // total round-trip cost (from estimateFeeStack)
  }): RebalanceDecision {
    const feeGain = params.projectedFees24h - params.currentFees24h;
    const ratio = params.rebalanceCost > 0 ? feeGain / params.rebalanceCost : 0;

    // BRD: minimum gain = 2× rebalance cost
    const shouldRebalance = ratio >= 2.0;

    const reason = shouldRebalance
      ? `Fee gain $${feeGain.toFixed(4)} = ${ratio.toFixed(1)}× rebalance cost — profitable`
      : `Fee gain $${feeGain.toFixed(4)} = ${ratio.toFixed(1)}× rebalance cost — below 2× threshold (HOLD)`;

    logger.debug(`[DynamicSlippage] Break-even check: ${reason}`);

    return {
      shouldRebalance,
      reason,
      projectedFees24h: params.projectedFees24h,
      rebalanceCost: params.rebalanceCost,
      breakEvenRatio: ratio,
    };
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  updateSolPrice(solUsd: number): void {
    (this as { SOL_USD_PRICE: number }).SOL_USD_PRICE = solUsd;
  }
}
