// ==========================================
// DATABASE SERVICE
// Prisma ORM wrapper for database operations
// ==========================================

import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  Position,
  Trade,
  AIDecision,
  PerformanceMetrics,
  Pool,
  PoolSnapshot,
  PositionStatus,
  StrategyType,
  ActionType,
  PnL,
} from '../types';

export class DatabaseService {
  private prisma: PrismaClient;
  private isConnected: boolean = false;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.database.url,
        },
      },
      log: config.isDevelopment
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  async connect(): Promise<void> {
    try {
      logger.info('🔗 Connecting to database...');

      // Test connection
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;

      this.isConnected = true;
      logger.info('✅ Database connected successfully');

    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      logger.info('👋 Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  // ==========================================
  // POOL OPERATIONS
  // ==========================================

  async createOrUpdatePool(poolData: Partial<Pool>): Promise<Pool> {
    try {
      const pool = await this.prisma.pool.upsert({
        where: { address: poolData.address },
        update: {
          currentPrice: poolData.currentPrice,
          tvl: poolData.tvl,
          volume24h: poolData.volume24h,
          feeRate: poolData.feeRate,
          volatility: poolData.volatility,
          updatedAt: new Date(),
        },
        create: {
          address: poolData.address!,
          tokenA: poolData.tokenA!.address,
          tokenB: poolData.tokenB!.address,
          tokenASymbol: poolData.tokenA!.symbol,
          tokenBSymbol: poolData.tokenB!.symbol,
          currentPrice: poolData.currentPrice || 0,
          tvl: poolData.tvl || 0,
          volume24h: poolData.volume24h || 0,
          feeRate: poolData.feeRate || 0,
          volatility: poolData.volatility || 0,
          poolCreatedAt: poolData.createdAt || new Date(),
        },
      });

      return this.mapPrismaPoolToPool(pool);

    } catch (error) {
      logger.error('Error creating/updating pool:', error);
      throw error;
    }
  }

  async getPoolByAddress(address: string): Promise<Pool | null> {
    try {
      const pool = await this.prisma.pool.findUnique({
        where: { address },
      });

      return pool ? this.mapPrismaPoolToPool(pool) : null;

    } catch (error) {
      logger.error('Error fetching pool:', error);
      return null;
    }
  }

  async getAllPools(): Promise<Pool[]> {
    try {
      const pools = await this.prisma.pool.findMany();
      return pools.map(p => this.mapPrismaPoolToPool(p));

    } catch (error) {
      logger.error('Error fetching all pools:', error);
      return [];
    }
  }

  // ==========================================
  // POSITION OPERATIONS
  // ==========================================

  async createPosition(positionData: Partial<Position>): Promise<Position> {
    try {
      // Get or create pool first
      let poolId: string;
      const existingPool = await this.prisma.pool.findUnique({
        where: { address: positionData.poolAddress },
      });

      if (existingPool) {
        poolId = existingPool.id;
      } else {
        // Create pool record
        const newPool = await this.createOrUpdatePool({
          address: positionData.poolAddress!,
          currentPrice: positionData.entryPrice,
          tvl: 0,
          volume24h: 0,
          feeRate: 0,
          volatility: 0,
        });
        poolId = newPool.id;
      }

      const position = await this.prisma.position.create({
        data: {
          poolId,
          strategy: positionData.strategy!,
          entryPrice: positionData.entryPrice || 0,
          entryTime: positionData.entryTime || new Date(),
          investmentSol: positionData.investment?.sol || 0,
          investmentUsd: positionData.investment?.usd || 0,
          rangeLower: positionData.range?.lower || 0,
          rangeUpper: positionData.range?.upper || 0,
          currentPrice: positionData.currentPrice,
          currentValueUsd: positionData.currentValue?.usd,
          realizedPnl: positionData.pnl?.realized || 0,
          unrealizedPnl: positionData.pnl?.unrealized || 0,
          pnlPercentage: positionData.pnl?.percentage || 0,
          feesTokenA: positionData.feesEarned?.tokenA || 0,
          feesTokenB: positionData.feesEarned?.tokenB || 0,
          feesUsd: positionData.feesEarned?.usd || 0,
          impermanentLoss: positionData.impermanentLoss?.percentage || 0,
          status: positionData.status || 'active',
          inRange: positionData.inRange ?? true,
          aiConfidence: positionData.aiConfidence || 0,
          riskScore: positionData.riskScore || 0,
          expectedApr: positionData.expectedAPR || 0,
          entryTxSignature: positionData.entryTxSignature!,
        },
      });

      return this.mapPrismaPositionToPosition(position);

    } catch (error) {
      logger.error('Error creating position:', error);
      throw error;
    }
  }

  async getPositionById(id: string): Promise<Position | null> {
    try {
      const position = await this.prisma.position.findUnique({
        where: { id },
        include: { pool: true },
      });

      return position ? this.mapPrismaPositionToPosition(position) : null;

    } catch (error) {
      logger.error('Error fetching position:', error);
      return null;
    }
  }

  async getAllPositions(): Promise<Position[]> {
    try {
      const positions = await this.prisma.position.findMany({
        include: { pool: true },
        orderBy: { entryTime: 'desc' },
      });

      return positions.map(p => this.mapPrismaPositionToPosition(p));

    } catch (error) {
      logger.error('Error fetching all positions:', error);
      return [];
    }
  }

  async getActivePositions(): Promise<Position[]> {
    try {
      const positions = await this.prisma.position.findMany({
        where: {
          status: 'active',
        },
        include: { pool: true },
        orderBy: { entryTime: 'desc' },
      });

      return positions.map(p => this.mapPrismaPositionToPosition(p));

    } catch (error) {
      logger.error('Error fetching active positions:', error);
      return [];
    }
  }

  async updatePosition(id: string, data: Partial<Position>): Promise<Position> {
    try {
      const updateData: any = {};

      if (data.currentPrice !== undefined) updateData.currentPrice = data.currentPrice;
      if (data.currentValue?.usd !== undefined) updateData.currentValueUsd = data.currentValue.usd;
      if (data.pnl?.realized !== undefined) updateData.realizedPnl = data.pnl.realized;
      if (data.pnl?.unrealized !== undefined) updateData.unrealizedPnl = data.pnl.unrealized;
      if (data.pnl?.percentage !== undefined) updateData.pnlPercentage = data.pnl.percentage;
      if (data.feesEarned?.usd !== undefined) updateData.feesUsd = data.feesEarned.usd;
      if (data.impermanentLoss?.percentage !== undefined) updateData.impermanentLoss = data.impermanentLoss.percentage;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.inRange !== undefined) updateData.inRange = data.inRange;
      if (data.lastRebalance !== undefined) updateData.lastRebalance = data.lastRebalance;
      if (data.exitTime !== undefined) updateData.exitTime = data.exitTime;
      if (data.exitTxSignature !== undefined) updateData.exitTxSignature = data.exitTxSignature;

      const position = await this.prisma.position.update({
        where: { id },
        data: updateData,
        include: { pool: true },
      });

      return this.mapPrismaPositionToPosition(position);

    } catch (error) {
      logger.error('Error updating position:', error);
      throw error;
    }
  }

  async closePosition(id: string, exitData: {
    exitPrice: number;
    pnl: PnL;
    exitTxSignature: string;
  }): Promise<Position> {
    try {
      const position = await this.prisma.position.update({
        where: { id },
        data: {
          status: 'closed',
          exitTime: new Date(),
          realizedPnl: exitData.pnl.realized,
          unrealizedPnl: 0,
          pnlPercentage: exitData.pnl.percentage,
          exitTxSignature: exitData.exitTxSignature,
        },
        include: { pool: true },
      });

      return this.mapPrismaPositionToPosition(position);

    } catch (error) {
      logger.error('Error closing position:', error);
      throw error;
    }
  }

  // ==========================================
  // TRADE OPERATIONS
  // ==========================================

  async createTrade(tradeData: Partial<Trade>): Promise<Trade> {
    try {
      const trade = await this.prisma.trade.create({
        data: {
          positionId: tradeData.positionId!,
          type: tradeData.type!,
          action: tradeData.action!,
          tokenIn: tradeData.tokenIn,
          tokenOut: tradeData.tokenOut,
          amountIn: tradeData.amountIn,
          amountOut: tradeData.amountOut,
          slippage: tradeData.slippage || 0,
          gasCostSol: tradeData.gasCost || 0,
          txSignature: tradeData.txSignature!,
          success: tradeData.success ?? true,
          errorMessage: tradeData.error,
          timestamp: tradeData.timestamp || new Date(),
        },
      });

      return this.mapPrismaTradeToTrade(trade);

    } catch (error) {
      logger.error('Error creating trade:', error);
      throw error;
    }
  }

  async getTradesByPosition(positionId: string): Promise<Trade[]> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: { positionId },
        orderBy: { timestamp: 'desc' },
      });

      return trades.map(t => this.mapPrismaTradeToTrade(t));

    } catch (error) {
      logger.error('Error fetching trades:', error);
      return [];
    }
  }

  // ==========================================
  // AI DECISION OPERATIONS
  // ==========================================

  async createAIDecision(decisionData: Partial<AIDecision>): Promise<AIDecision> {
    try {
      // Get or create pool
      let poolId: string;
      const existingPool = await this.prisma.pool.findUnique({
        where: { address: decisionData.poolAddress },
      });

      if (existingPool) {
        poolId = existingPool.id;
      } else {
        const newPool = await this.prisma.pool.create({
          data: {
            address: decisionData.poolAddress!,
            tokenA: 'unknown',
            tokenB: 'unknown',
            tokenASymbol: 'UNKNOWN',
            tokenBSymbol: 'UNKNOWN',
            currentPrice: 0,
            tvl: 0,
            volume24h: 0,
            feeRate: 0,
            volatility: 0,
            poolCreatedAt: new Date(),
          },
        });
        poolId = newPool.id;
      }

      const decision = await this.prisma.aIDecision.create({
        data: {
          poolId,
          action: decisionData.action!,
          strategy: decisionData.strategy,
          confidence: decisionData.confidence || 0,
          expectedApr: decisionData.expectedAPR || 0,
          riskScore: decisionData.riskScore || 0,
          reasoning: decisionData.reasoning || '',
          recommendedRangeLower: decisionData.recommendedRange?.lower,
          recommendedRangeUpper: decisionData.recommendedRange?.upper,
          positionSize: decisionData.positionSize,
          executed: decisionData.executed ?? false,
          timestamp: decisionData.timestamp || new Date(),
        },
      });

      return this.mapPrismaDecisionToDecision(decision);

    } catch (error) {
      logger.error('Error creating AI decision:', error);
      throw error;
    }
  }

  async updateAIDecisionResult(id: string, result: {
    success: boolean;
    pnl?: number;
  }): Promise<AIDecision> {
    try {
      const decision = await this.prisma.aIDecision.update({
        where: { id },
        data: {
          executed: true,
          resultSuccess: result.success,
          resultPnl: result.pnl,
        },
        include: { pool: true },
      });

      return this.mapPrismaDecisionToDecision(decision);

    } catch (error) {
      logger.error('Error updating AI decision result:', error);
      throw error;
    }
  }

  // ==========================================
  // PERFORMANCE OPERATIONS
  // ==========================================

  async createPerformanceRecord(data: Partial<PerformanceMetrics>): Promise<PerformanceMetrics> {
    try {
      const record = await this.prisma.performance.create({
        data: {
          date: data.date || new Date(),
          startingBalance: data.startingBalance || 0,
          endingBalance: data.endingBalance || 0,
          realizedPnl: data.realizedPnL || 0,
          unrealizedPnl: data.unrealizedPnL || 0,
          feesEarned: data.feesEarned || 0,
          impermanentLoss: data.impermanentLoss || 0,
          totalTrades: data.totalTrades || 0,
          winningTrades: data.winningTrades || 0,
          losingTrades: (data.totalTrades || 0) - (data.winningTrades || 0),
          winRate: data.winRate || 0,
          averageReturn: data.averageReturn || 0,
          sharpeRatio: data.sharpeRatio,
          maxDrawdown: data.maxDrawdown,
          volatility: data.volatility,
          aiConfidenceAvg: data.aiConfidenceAvg,
        },
      });

      return this.mapPrismaPerformanceToPerformance(record);

    } catch (error) {
      logger.error('Error creating performance record:', error);
      throw error;
    }
  }

  async getPerformanceHistory(days: number = 30): Promise<PerformanceMetrics[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const records = await this.prisma.performance.findMany({
        where: {
          date: {
            gte: startDate,
          },
        },
        orderBy: { date: 'desc' },
      });

      return records.map(r => this.mapPrismaPerformanceToPerformance(r));

    } catch (error) {
      logger.error('Error fetching performance history:', error);
      return [];
    }
  }

  // ==========================================
  // POOL SNAPSHOT OPERATIONS
  // ==========================================

  async createPoolSnapshot(snapshotData: Partial<PoolSnapshot>): Promise<PoolSnapshot> {
    try {
      const snapshot = await this.prisma.poolSnapshot.create({
        data: {
          poolId: snapshotData.poolId!,
          price: snapshotData.price || 0,
          tvl: snapshotData.tvl || 0,
          volume24h: snapshotData.volume24h || 0,
          volatility: snapshotData.volatility || 0,
          opportunityScore: snapshotData.opportunityScore,
          feeApr: snapshotData.feeAPR,
          timestamp: snapshotData.timestamp || new Date(),
        },
      });

      return this.mapPrismaSnapshotToSnapshot(snapshot);

    } catch (error) {
      logger.error('Error creating pool snapshot:', error);
      throw error;
    }
  }

  // ==========================================
  // MAPPERS (Prisma to Domain)
  // ==========================================

  private mapPrismaPoolToPool(pool: any): Pool {
    return {
      id: pool.id,
      address: pool.address,
      tokenA: {
        address: pool.tokenA,
        symbol: pool.tokenASymbol,
        name: pool.tokenASymbol,
        decimals: 0, // Not stored in DB
      },
      tokenB: {
        address: pool.tokenB,
        symbol: pool.tokenBSymbol,
        name: pool.tokenBSymbol,
        decimals: 0,
      },
      currentPrice: Number(pool.currentPrice),
      tvl: Number(pool.tvl),
      volume24h: Number(pool.volume24h),
      feeRate: Number(pool.feeRate),
      volatility: Number(pool.volatility),
      createdAt: pool.poolCreatedAt,
      updatedAt: pool.updatedAt,
    } as Pool;
  }

  private mapPrismaPositionToPosition(position: any): Position {
    return {
      id: position.id,
      poolAddress: position.pool?.address || '',
      strategy: position.strategy as StrategyType,
      entryPrice: Number(position.entryPrice),
      entryTime: position.entryTime,
      investment: {
        sol: Number(position.investmentSol),
        usd: Number(position.investmentUsd),
      },
      range: {
        lower: Number(position.rangeLower),
        upper: Number(position.rangeUpper),
      },
      currentPrice: position.currentPrice ? Number(position.currentPrice) : undefined,
      currentValue: position.currentValueUsd ? {
        usd: Number(position.currentValueUsd),
      } : undefined,
      pnl: {
        realized: Number(position.realizedPnl),
        unrealized: Number(position.unrealizedPnl),
        percentage: Number(position.pnlPercentage),
      },
      feesEarned: {
        tokenA: Number(position.feesTokenA),
        tokenB: Number(position.feesTokenB),
        usd: Number(position.feesUsd),
      },
      impermanentLoss: {
        percentage: Number(position.impermanentLoss),
        usd: 0, // Calculate if needed
      },
      status: position.status as PositionStatus,
      inRange: position.inRange,
      aiConfidence: Number(position.aiConfidence),
      riskScore: position.riskScore,
      expectedAPR: Number(position.expectedApr),
      lastRebalance: position.lastRebalance || undefined,
      exitTime: position.exitTime || undefined,
      entryTxSignature: position.entryTxSignature,
      exitTxSignature: position.exitTxSignature || undefined,
    } as Position;
  }

  private mapPrismaTradeToTrade(trade: any): Trade {
    return {
      id: trade.id,
      positionId: trade.positionId,
      type: trade.type as any,
      action: trade.action as any,
      tokenIn: trade.tokenIn || undefined,
      tokenOut: trade.tokenOut || undefined,
      amountIn: trade.amountIn ? Number(trade.amountIn) : undefined,
      amountOut: trade.amountOut ? Number(trade.amountOut) : undefined,
      slippage: Number(trade.slippage),
      gasCost: Number(trade.gasCostSol),
      txSignature: trade.txSignature,
      success: trade.success,
      error: trade.errorMessage || undefined,
      timestamp: trade.timestamp,
    } as Trade;
  }

  private mapPrismaDecisionToDecision(decision: any): AIDecision {
    return {
      id: decision.id,
      poolAddress: decision.pool?.address || '',
      action: decision.action as ActionType,
      strategy: decision.strategy as StrategyType | undefined,
      confidence: Number(decision.confidence),
      expectedAPR: Number(decision.expectedApr),
      riskScore: decision.riskScore,
      reasoning: decision.reasoning,
      recommendedRange: decision.recommendedRangeLower ? {
        lower: Number(decision.recommendedRangeLower),
        upper: Number(decision.recommendedRangeUpper),
      } : undefined,
      positionSize: decision.positionSize ? Number(decision.positionSize) : undefined,
      executed: decision.executed,
      result: decision.resultSuccess !== null ? {
        success: decision.resultSuccess,
        pnl: decision.resultPnl ? Number(decision.resultPnl) : undefined,
      } : undefined,
      timestamp: decision.timestamp,
    } as AIDecision;
  }

  private mapPrismaPerformanceToPerformance(record: any): PerformanceMetrics {
    return {
      date: record.date,
      startingBalance: Number(record.startingBalance),
      endingBalance: Number(record.endingBalance),
      realizedPnL: Number(record.realizedPnl),
      unrealizedPnL: Number(record.unrealizedPnl),
      feesEarned: Number(record.feesEarned),
      impermanentLoss: Number(record.impermanentLoss),
      totalTrades: record.totalTrades,
      winningTrades: record.winningTrades,
      losingTrades: record.losingTrades,
      winRate: Number(record.winRate),
      averageReturn: Number(record.averageReturn),
      sharpeRatio: record.sharpeRatio ? Number(record.sharpeRatio) : undefined,
      maxDrawdown: record.maxDrawdown ? Number(record.maxDrawdown) : undefined,
      volatility: record.volatility ? Number(record.volatility) : undefined,
      aiConfidenceAvg: record.aiConfidenceAvg ? Number(record.aiConfidenceAvg) : undefined,
    } as PerformanceMetrics;
  }

  private mapPrismaSnapshotToSnapshot(snapshot: any): PoolSnapshot {
    return {
      id: snapshot.id,
      poolId: snapshot.poolId,
      price: Number(snapshot.price),
      tvl: Number(snapshot.tvl),
      volume24h: Number(snapshot.volume24h),
      volatility: Number(snapshot.volatility),
      opportunityScore: snapshot.opportunityScore ? Number(snapshot.opportunityScore) : undefined,
      feeAPR: snapshot.feeApr ? Number(snapshot.feeApr) : undefined,
      timestamp: snapshot.timestamp,
    } as PoolSnapshot;
  }

  // ==========================================
  // RAW PRISMA ACCESS (for advanced queries)
  // ==========================================

  getPrismaClient(): PrismaClient {
    return this.prisma;
  }
}

export default DatabaseService;
