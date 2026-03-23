/**
 * BacktestEngine.ts
 * BRD v3 §8 — Backtesting framework + paper trading mode.
 * NEW in v3.0: 3-stage validation required before mainnet deployment.
 * Stage 1: Historical backtest (90 days)
 * Stage 2: Paper trading (30 days live, no real TX)
 * Stage 3: Small capital test (14 days, 5% of target)
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationStage = 'historical' | 'paper' | 'small_capital' | 'production';

export interface PoolSnapshot {
  poolAddress: string;
  price: number;
  tvl: number;
  volume24h: number;
  volatility: number;
  feeRate: number;
  timestamp: Date;
}

export interface SimulatedTrade {
  id: string;
  poolAddress: string;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  rangeWidth: number;
  feesEarned: number;
  feeCost: number;         // full fee stack (slippage + gas + protocol)
  impermanentLoss: number;
  pnlUsd: number;
  pnlPct: number;
  holdDurationHours: number;
  rebalanceCount: number;
  timeInRangePct: number;
  entryAt: Date;
  exitAt: Date;
  stage: ValidationStage;
}

export interface BacktestMetrics {
  stage: ValidationStage;
  periodDays: number;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  dailyROI: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  avgDrawdownDuration: number;
  profitFactor: number;
  avgWinLossRatio: number;
  timeInRangePct: number;
  rebalanceFrequency: number;
  feeEfficiencyRatio: number;  // fees earned / fees paid
  passesGate: boolean;
  gateFailReasons: string[];
}

// Pass criteria per stage (BRD v3 §8.1)
const PASS_CRITERIA = {
  historical:   { sharpe: 1.5, maxDrawdown: 0.10, minDays: 90 },
  paper:        { winRate: 0.60, dailyROI: 0.002, minDays: 30 },
  small_capital: { matchesPaperPct: 0.20, minDays: 14 },
};

// ─── BacktestEngine ───────────────────────────────────────────────────────────

export class BacktestEngine {
  private paperTrades: SimulatedTrade[] = [];
  private isPaperMode: boolean;
  private paperModeStartedAt: Date | null = null;

  // DB/service deps injected
  private getPoolSnapshots: (poolAddress: string, days: number) => Promise<PoolSnapshot[]>;
  private getDynamicSlippage: (vol15min: number, tvlUsd: number) => number;
  private sendDailyPaperReport: (metrics: BacktestMetrics) => Promise<void>;

  constructor(deps: {
    getPoolSnapshots: (addr: string, days: number) => Promise<PoolSnapshot[]>;
    getDynamicSlippage: (vol15min: number, tvlUsd: number) => number;
    sendDailyPaperReport: (metrics: BacktestMetrics) => Promise<void>;
  }) {
    this.getPoolSnapshots = deps.getPoolSnapshots;
    this.getDynamicSlippage = deps.getDynamicSlippage;
    this.sendDailyPaperReport = deps.sendDailyPaperReport;
    this.isPaperMode = process.env.PAPER_TRADING_MODE === 'true';

    if (this.isPaperMode) {
      this.paperModeStartedAt = new Date();
      logger.info('[BacktestEngine] Paper trading mode ACTIVE — no real transactions will be signed');
    }
  }

  // ── Paper Trading Mode ─────────────────────────────────────────────────────

  isInPaperMode(): boolean { return this.isPaperMode; }

  /**
   * BRD v3 §8.3: Log a simulated trade (no real blockchain TX).
   * Identical schema to live trades — stored in paper_trades table.
   */
  logPaperTrade(trade: Omit<SimulatedTrade, 'id' | 'stage'>): SimulatedTrade {
    const paperId = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const paperTrade: SimulatedTrade = { ...trade, id: paperId, stage: 'paper' };

    this.paperTrades.push(paperTrade);
    logger.info(`[BacktestEngine] Paper trade logged: ${paperId} | pnl=${trade.pnlPct.toFixed(3)}% | pool=${trade.poolAddress.slice(0, 8)}...`);

    return paperTrade;
  }

  async generateDailyPaperReport(): Promise<BacktestMetrics> {
    const metrics = this.computeMetrics(this.paperTrades, 'paper');
    await this.sendDailyPaperReport(metrics);
    logger.info(`[BacktestEngine] Daily paper report sent. Trades: ${metrics.totalTrades}, WinRate: ${(metrics.winRate * 100).toFixed(1)}%`);
    return metrics;
  }

  // ── §8.1 Stage 1: Historical Backtest ─────────────────────────────────────

  async runHistoricalBacktest(params: {
    poolAddress: string;
    strategy: string;
    rangeWidthPct: number;
    days?: number;
  }): Promise<BacktestMetrics> {
    const days = params.days ?? 90;
    const minDays = parseInt(process.env.BACKTEST_MIN_DAYS ?? '90', 10);

    if (days < minDays) {
      throw new Error(`[BacktestEngine] Insufficient data: need ${minDays} days, got ${days}`);
    }

    logger.info(`[BacktestEngine] Starting historical backtest: pool=${params.poolAddress.slice(0, 8)}... strategy=${params.strategy} days=${days}`);

    const snapshots = await this.getPoolSnapshots(params.poolAddress, days);
    if (snapshots.length < 100) {
      throw new Error(`[BacktestEngine] Not enough snapshots: ${snapshots.length} (need ≥ 100)`);
    }

    const trades = this.simulateTradesOnSnapshots(snapshots, params);
    return this.computeMetrics(trades, 'historical');
  }

  // ── §8.2 Simulation Engine ─────────────────────────────────────────────────

  private simulateTradesOnSnapshots(
    snapshots: PoolSnapshot[],
    params: { strategy: string; rangeWidthPct: number },
  ): SimulatedTrade[] {
    const trades: SimulatedTrade[] = [];
    const { strategy, rangeWidthPct } = params;

    let i = 0;
    while (i < snapshots.length - 1) {
      const entrySnap = snapshots[i];
      const entryPrice = entrySnap.price;
      const lower = entryPrice * (1 - rangeWidthPct);
      const upper = entryPrice * (1 + rangeWidthPct);

      // BRD §8.2: slippage from dynamic model
      const entrySlippageBps = this.getDynamicSlippage(entrySnap.volatility, entrySnap.tvl);
      const entrySlippageCost = (entrySnap.tvl * 0.01) * (entrySlippageBps / 10_000); // approx on $1K position

      let totalFees = 0;
      let totalIL = 0;
      let inRangeCount = 0;
      let rebalances = 0;
      let j = i + 1;

      // Simulate holding the position until out-of-range × 3 (or end of data)
      while (j < snapshots.length) {
        const snap = snapshots[j];
        if (snap.price >= lower && snap.price <= upper) {
          inRangeCount++;
          // Fee earned = volume × fee_rate × position_share (assume 1% share)
          totalFees += snap.volume24h * snap.feeRate * 0.01 / 24; // per snapshot hour
        } else {
          rebalances++;
          break; // Exit on first out-of-range (simplified)
        }
        j++;
      }

      const exitSnap = snapshots[Math.min(j, snapshots.length - 1)];
      const exitPrice = exitSnap.price;

      // IL formula (BRD v3 §5.3)
      const priceRatio = exitPrice / entryPrice;
      const il = Math.abs((2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1);

      // Full fee stack cost (BRD §4.3)
      const exitSlippageBps = this.getDynamicSlippage(exitSnap.volatility, exitSnap.tvl);
      const totalFeeCost = entrySlippageCost + (entrySnap.tvl * 0.01) * (exitSlippageBps / 10_000)
        + 0.01 * 150 * 4; // gas: 4 txs × 0.01 SOL × $150

      const grossPnl = totalFees - totalFeeCost;
      const pnlAfterIL = grossPnl - (entrySnap.tvl * 0.01 * il);
      const holdHours = j - i;

      trades.push({
        id: `bt_${i}`,
        poolAddress: entrySnap.poolAddress,
        strategy,
        entryPrice,
        exitPrice,
        rangeWidth: rangeWidthPct,
        feesEarned: totalFees,
        feeCost: totalFeeCost,
        impermanentLoss: il,
        pnlUsd: pnlAfterIL,
        pnlPct: pnlAfterIL / (entrySnap.tvl * 0.01),
        holdDurationHours: holdHours,
        rebalanceCount: rebalances,
        timeInRangePct: inRangeCount / Math.max(j - i, 1),
        entryAt: entrySnap.timestamp,
        exitAt: exitSnap.timestamp,
        stage: 'historical',
      });

      i = j + 1;
    }

    return trades;
  }

  // ── §8.2 Performance Metrics ───────────────────────────────────────────────

  computeMetrics(trades: SimulatedTrade[], stage: ValidationStage): BacktestMetrics {
    if (trades.length === 0) {
      return this.emptyMetrics(stage);
    }

    const wins = trades.filter(t => t.pnlUsd > 0);
    const losses = trades.filter(t => t.pnlUsd <= 0);
    const winRate = wins.length / trades.length;

    // Returns per trade
    const returns = trades.map(t => t.pnlPct);
    const totalReturn = returns.reduce((s, r) => s + r, 0);
    const avgReturn = totalReturn / returns.length;

    // Daily ROI (approximate)
    const totalDays = trades.reduce((s, t) => s + t.holdDurationHours / 24, 0) || 1;
    const dailyROI = totalReturn / totalDays;

    // Sharpe (daily, annualized)
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance) || 0.001;
    const sharpeRatio = ((avgReturn - 0.001) / stdDev) * Math.sqrt(365);

    // Sortino (downside only)
    const downside = returns.filter(r => r < 0);
    const downsideVariance = downside.reduce((s, r) => s + r * r, 0) / (downside.length || 1);
    const sortinoRatio = ((avgReturn - 0.001) / Math.sqrt(downsideVariance || 0.001)) * Math.sqrt(365);

    // Max drawdown (equity curve)
    let peak = 0, maxDrawdown = 0;
    let equity = 0;
    for (const t of trades) {
      equity += t.pnlPct;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? (peak - equity) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Calmar = annualized return / max drawdown
    const annualizedReturn = dailyROI * 365;
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Profit factor
    const grossProfit = wins.reduce((s, t) => s + t.pnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Avg win/loss
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Fee efficiency = fees earned / fees paid
    const totalFeesEarned = trades.reduce((s, t) => s + t.feesEarned, 0);
    const totalFeesPaid = trades.reduce((s, t) => s + t.feeCost, 0);
    const feeEfficiencyRatio = totalFeesPaid > 0 ? totalFeesEarned / totalFeesPaid : 0;

    // Time in range
    const timeInRangePct = trades.reduce((s, t) => s + t.timeInRangePct, 0) / trades.length;

    // Rebalance frequency
    const rebalanceFrequency = trades.reduce((s, t) => s + t.rebalanceCount, 0) / (totalDays || 1);

    // Period
    const firstTrade = trades[0].entryAt;
    const lastTrade = trades[trades.length - 1].exitAt;
    const periodDays = (lastTrade.getTime() - firstTrade.getTime()) / 86_400_000;

    // Gate check
    const gateFailReasons: string[] = [];
    if (stage === 'historical') {
      if (sharpeRatio < PASS_CRITERIA.historical.sharpe)
        gateFailReasons.push(`Sharpe ${sharpeRatio.toFixed(2)} < ${PASS_CRITERIA.historical.sharpe}`);
      if (maxDrawdown > PASS_CRITERIA.historical.maxDrawdown)
        gateFailReasons.push(`Drawdown ${(maxDrawdown * 100).toFixed(1)}% > 10%`);
      if (periodDays < PASS_CRITERIA.historical.minDays)
        gateFailReasons.push(`Period ${periodDays.toFixed(0)}d < 90d`);
    } else if (stage === 'paper') {
      if (winRate < PASS_CRITERIA.paper.winRate)
        gateFailReasons.push(`WinRate ${(winRate * 100).toFixed(1)}% < 60%`);
      if (dailyROI < PASS_CRITERIA.paper.dailyROI)
        gateFailReasons.push(`DailyROI ${(dailyROI * 100).toFixed(3)}% < 0.2%`);
      if (periodDays < PASS_CRITERIA.paper.minDays)
        gateFailReasons.push(`Period ${periodDays.toFixed(0)}d < 30d`);
    }

    return {
      stage, periodDays, totalTrades: trades.length,
      winRate, totalReturn, dailyROI,
      sharpeRatio, sortinoRatio, calmarRatio,
      maxDrawdown, avgDrawdownDuration: 0,
      profitFactor, avgWinLossRatio,
      timeInRangePct, rebalanceFrequency, feeEfficiencyRatio,
      passesGate: gateFailReasons.length === 0,
      gateFailReasons,
    };
  }

  private emptyMetrics(stage: ValidationStage): BacktestMetrics {
    return {
      stage, periodDays: 0, totalTrades: 0,
      winRate: 0, totalReturn: 0, dailyROI: 0,
      sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
      maxDrawdown: 0, avgDrawdownDuration: 0,
      profitFactor: 0, avgWinLossRatio: 0,
      timeInRangePct: 0, rebalanceFrequency: 0, feeEfficiencyRatio: 0,
      passesGate: false, gateFailReasons: ['No trade data available'],
    };
  }

  getPaperTrades(): SimulatedTrade[] { return this.paperTrades; }
  getPaperModeStartedAt(): Date | null { return this.paperModeStartedAt; }
}
