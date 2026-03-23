/**
 * PerformanceTracker.ts
 * Real-time performance metric tracking.
 * Gap fix: BRD section 13 defines Sharpe Ratio > 1.5, Win Rate > 65%, Daily ROI 0.3–0.5%.
 * Previously these were only config targets with no live measurement.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface LiveMetrics {
  // Daily
  dailyROI: number;           // e.g. 0.0042 = 0.42%
  dailyPnlUsd: number;
  dailyFeesEarned: number;
  dailyImpermanentLoss: number;

  // Win rate
  totalTrades: number;
  winningTrades: number;
  winRate: number;            // 0–1

  // Risk-adjusted
  sharpeRatio: number;
  maxDrawdown: number;        // 0–1
  currentDrawdown: number;

  // Portfolio
  startingBalance: number;
  currentBalance: number;
  totalROI: number;

  // Timestamps
  calculatedAt: Date;
  periodStart: Date;
}

export interface DrawdownInfo {
  currentDrawdown: number;
  maxDrawdown: number;
  peakBalance: number;
  troughBalance: number;
  startDate: Date | null;
  recoveryDate: Date | null;
}

export class PerformanceTracker {
  private prisma: PrismaClient;

  private peakBalance: number = 0;
  private dailyStartBalance: number = 0;
  private dailyPnl: number[] = [];        // rolling 30 days
  private tradeReturns: number[] = [];    // rolling 100 trades
  private currentBalance: number = 0;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async initialize(startingBalance: number): Promise<void> {
    this.currentBalance = startingBalance;
    this.peakBalance = startingBalance;
    this.dailyStartBalance = startingBalance;

    // Load historical daily PnL from DB
    try {
      const history = await this.prisma.performance.findMany({
        orderBy: { date: 'desc' },
        take: 30,
      });

      this.dailyPnl = history.map(h => Number(h.realizedPnl ?? 0));

      logger.info('[PerformanceTracker] Initialized. Starting balance:', startingBalance);
    } catch (err) {
      logger.warn('[PerformanceTracker] Could not load history:', err);
    }
  }

  // ── Record Updates ─────────────────────────────────────────────────────────

  recordTrade(pnlUsd: number, pnlPercentage: number): void {
    this.currentBalance += pnlUsd;
    this.tradeReturns.push(pnlPercentage);
    if (this.tradeReturns.length > 100) this.tradeReturns.shift();

    // Update peak
    if (this.currentBalance > this.peakBalance) {
      this.peakBalance = this.currentBalance;
    }
  }

  async recordDailyClose(): Promise<void> {
    const dailyROI = this.dailyStartBalance > 0
      ? (this.currentBalance - this.dailyStartBalance) / this.dailyStartBalance
      : 0;

    this.dailyPnl.push(dailyROI);
    if (this.dailyPnl.length > 30) this.dailyPnl.shift();

    // Persist to DB
    try {
      await this.prisma.performance.create({
        data: {
          date: new Date(),
          startingBalance: this.dailyStartBalance,
          endingBalance: this.currentBalance,
          realizedPnl: this.currentBalance - this.dailyStartBalance,
          unrealizedPnl: 0,
          feesEarned: 0,
          impermanentLoss: 0,
          totalTrades: this.tradeReturns.length,
          winningTrades: this.tradeReturns.filter(r => r > 0).length,
          aiConfidenceAvg: 0,
          sharpeRatio: this.calculateSharpe(),
          maxDrawdown: this.getDrawdownInfo().maxDrawdown,
        },
      });
    } catch (err) {
      logger.error('[PerformanceTracker] Failed to persist daily record:', err);
    }

    this.dailyStartBalance = this.currentBalance;
    logger.info(`[PerformanceTracker] Daily close recorded. ROI: ${(dailyROI * 100).toFixed(3)}%`);
  }

  // ── Live Calculations ──────────────────────────────────────────────────────

  getLiveMetrics(): LiveMetrics {
    const wins = this.tradeReturns.filter(r => r > 0).length;
    const totalTrades = this.tradeReturns.length;
    const dailyROI = this.dailyStartBalance > 0
      ? (this.currentBalance - this.dailyStartBalance) / this.dailyStartBalance
      : 0;
    const drawdown = this.getDrawdownInfo();

    return {
      dailyROI,
      dailyPnlUsd: this.currentBalance - this.dailyStartBalance,
      dailyFeesEarned: 0,   // populated by TradingEngine
      dailyImpermanentLoss: 0,

      totalTrades,
      winningTrades: wins,
      winRate: totalTrades > 0 ? wins / totalTrades : 0,

      sharpeRatio: this.calculateSharpe(),
      maxDrawdown: drawdown.maxDrawdown,
      currentDrawdown: drawdown.currentDrawdown,

      startingBalance: this.dailyStartBalance,
      currentBalance: this.currentBalance,
      totalROI: this.dailyStartBalance > 0
        ? (this.currentBalance - this.dailyStartBalance) / this.dailyStartBalance
        : 0,

      calculatedAt: new Date(),
      periodStart: new Date(new Date().setHours(0, 0, 0, 0)),
    };
  }

  /**
   * Annualised Sharpe Ratio using daily returns.
   * Target: > 1.5 per BRD section 13.
   */
  calculateSharpe(): number {
    if (this.dailyPnl.length < 7) return 0;

    const returns = this.dailyPnl;
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualise: multiply by sqrt(365)
    const dailyRiskFree = 0.05 / 365; // 5% annual risk-free
    return ((avgReturn - dailyRiskFree) / stdDev) * Math.sqrt(365);
  }

  getDrawdownInfo(): DrawdownInfo {
    const currentDrawdown = this.peakBalance > 0
      ? (this.peakBalance - this.currentBalance) / this.peakBalance
      : 0;

    // Max drawdown from daily PnL series
    let peak = 1.0;
    let maxDrawdown = 0;
    let cumulative = 1.0;

    for (const ret of this.dailyPnl) {
      cumulative *= (1 + ret);
      if (cumulative > peak) peak = cumulative;
      const dd = (peak - cumulative) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return {
      currentDrawdown,
      maxDrawdown,
      peakBalance: this.peakBalance,
      troughBalance: this.currentBalance,
      startDate: null,
      recoveryDate: null,
    };
  }

  /**
   * Check if we are meeting BRD performance targets.
   */
  checkTargets(): { metric: string; target: string; actual: string; passing: boolean }[] {
    const m = this.getLiveMetrics();
    return [
      {
        metric: 'Daily ROI',
        target: '0.3–0.5%',
        actual: `${(m.dailyROI * 100).toFixed(3)}%`,
        passing: m.dailyROI >= 0.003,
      },
      {
        metric: 'Win Rate',
        target: '> 65%',
        actual: `${(m.winRate * 100).toFixed(1)}%`,
        passing: m.winRate >= 0.65,
      },
      {
        metric: 'Sharpe Ratio',
        target: '> 1.5',
        actual: m.sharpeRatio.toFixed(2),
        passing: m.sharpeRatio >= 1.5,
      },
      {
        metric: 'Max Drawdown',
        target: '< 10%',
        actual: `${(m.maxDrawdown * 100).toFixed(1)}%`,
        passing: m.maxDrawdown < 0.10,
      },
    ];
  }
}
