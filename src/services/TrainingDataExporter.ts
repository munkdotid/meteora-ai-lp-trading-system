/**
 * TrainingDataExporter.ts
 * BRD v3 §3.2 — Export pool snapshots from PostgreSQL to training data JSON.
 *
 * "Training Data Sources: Meteora pool snapshots (90 days), on-chain volume
 *  data, Jupiter route efficiency history, and Solana epoch performance data."
 *
 * Exports per-model JSON files to /data/pool_snapshots/:
 *   volume_predictor_data.json      — time-series of volume snapshots
 *   price_trend_classifier_data.json — price + feature snapshots
 *   volatility_forecaster_data.json  — price + volatility snapshots
 *   strategy_selector_data.json      — snapshots + trade history
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import type { PoolSnapshot } from './MLTrainingEngine';

const prisma = new PrismaClient();

// ─── Export functions ─────────────────────────────────────────────────────────

export async function exportTrainingData(
  outputDir: string,
  days: number = 90
): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });

  const since = new Date(Date.now() - days * 24 * 3_600_000);

  logger.info(`[DataExporter] Exporting ${days} days of training data → ${outputDir}`);

  // Fetch all pool snapshots since cutoff
  const rawSnapshots = await prisma.poolSnapshot.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
    select: {
      timestamp: true,
      price: true,
      tvl: true,
      volume24h: true,
      feeRate: true,
      volatility: true,
      volumeTvlRatio: true,
    },
  });

  if (rawSnapshots.length < 50) {
    logger.warn(`[DataExporter] Only ${rawSnapshots.length} snapshots — may be insufficient for training`);
  }

  // Convert Prisma Decimal → number
  const snapshots: PoolSnapshot[] = rawSnapshots.map(s => ({
    timestamp:      new Date(s.timestamp).getTime(),
    price:          Number(s.price),
    tvl:            Number(s.tvl),
    volume24h:      Number(s.volume24h),
    feeRate:        Number(s.feeRate),
    volatility:     Number(s.volatility ?? 0),
    volumeTVLRatio: Number(s.volumeTvlRatio ?? 0),
  }));

  // Fetch trade history for strategy selector
  const trades = await prisma.trade.findMany({
    where: { timestamp: { gte: since }, type: 'exit', success: true },
    include: { position: { select: { strategy: true, poolId: true, pnlUsd: true } } },
    orderBy: { timestamp: 'asc' },
  });

  const tradeHistory = trades
    .filter(t => t.position)
    .map(t => ({
      strategy:    t.position!.strategy,
      pnl:         Number(t.position!.pnlUsd ?? 0),
      poolAddress: t.position!.poolId,
    }));

  // Write model-specific data files
  const models = [
    'volume_predictor',
    'price_trend_classifier',
    'volatility_forecaster',
    'strategy_selector',
  ] as const;

  for (const model of models) {
    const data = model === 'strategy_selector'
      ? { snapshots, trades: tradeHistory }
      : { snapshots };

    const outPath = path.join(outputDir, `${model}_data.json`);
    fs.writeFileSync(outPath, JSON.stringify(data));
    logger.info(`[DataExporter] Wrote ${model}_data.json (${snapshots.length} snapshots${model === 'strategy_selector' ? `, ${tradeHistory.length} trades` : ''})`);
  }

  // Write summary
  const summary = {
    exportedAt: new Date().toISOString(),
    days,
    snapshotCount: snapshots.length,
    tradeCount: tradeHistory.length,
    dateRange: {
      from: rawSnapshots[0]?.timestamp ?? null,
      to:   rawSnapshots[rawSnapshots.length - 1]?.timestamp ?? null,
    },
  };
  fs.writeFileSync(path.join(outputDir, 'export_summary.json'), JSON.stringify(summary, null, 2));

  logger.info(`[DataExporter] Export complete. ${snapshots.length} snapshots, ${tradeHistory.length} trades`);
}
