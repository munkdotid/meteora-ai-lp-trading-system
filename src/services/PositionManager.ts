// ==========================================
// POSITION MANAGER
// Manages position lifecycle and state
// ==========================================

import { DatabaseService } from './DatabaseService';
import { MeteoraService } from './MeteoraService';
import { JupiterService } from './JupiterService';
import { WalletService } from './WalletService';
import { config } from '../config';
import { logger, tradeLogger } from '../utils/logger';
import {
  Position,
  PnL,
  Trade,
  StrategyType,
  PositionStatus,
  AIDecision,
  RebalanceDecision,
  DLMMStrategyParams,
} from '../types';

export class PositionManager {
  private db: DatabaseService;
  private meteoraService: MeteoraService;
  private jupiterService: JupiterService;
  private walletService: WalletService;
  
  private activePositions: Map<string, Position> = new Map();
  private isMonitoring: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(
    db: DatabaseService,
    meteoraService: MeteoraService,
    jupiterService: JupiterService,
    walletService: WalletService
  ) {
    this.db = db;
    this.meteoraService = meteoraService;
    this.jupiterService = jupiterService;
    this.walletService = walletService;
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('📊 Initializing position manager...');

    try {
      // Load active positions from database
      const positions = await this.db.getActivePositions();
      
      for (const position of positions) {
        this.activePositions.set(position.id, position);
      }

      logger.info(`✅ Position manager initialized`);
      logger.info(`   Active positions loaded: ${this.activePositions.size}`);

    } catch (error) {
      logger.error('❌ Failed to initialize position manager:', error);
      throw error;
    }
  }

  // ==========================================
  // POSITION CREATION
  // ==========================================

  async createPosition(
    decision: AIDecision,
    swapSignature?: string
  ): Promise<Position> {
    try {
      logger.info('📊 Creating new position...');
      logger.info(`   Pool: ${decision.poolAddress}`);
      logger.info(`   Strategy: ${decision.strategy}`);
      logger.info(`   Range: ${decision.recommendedRange?.lower} - ${decision.recommendedRange?.upper}`);

      // Get current wallet balance for position sizing
      const walletBalance = await this.walletService.getBalance();
      const positionUsdValue = walletBalance * (decision.positionSize || 0.2);

      // Get pool info
      const pool = await this.meteoraService.getPool(decision.poolAddress);
      const currentPrice = pool.currentPrice;

      // Calculate bin range
      const binRange = await this.meteoraService.calculateOptimalBinRange(
        decision.poolAddress,
        decision.strategy === 'alpha' ? 'narrow' : decision.strategy === 'range' ? 'medium' : 'wide',
        pool.volatility
      );

      // Create position in database
      const positionData: Partial<Position> = {
        poolAddress: decision.poolAddress,
        strategy: decision.strategy || 'range',
        entryPrice: currentPrice,
        entryTime: new Date(),
        investment: {
          sol: positionUsdValue / 100, // Approximate SOL price
          usd: positionUsdValue,
        },
        range: decision.recommendedRange || {
          lower: currentPrice * 0.95,
          upper: currentPrice * 1.05,
        },
        currentPrice: currentPrice,
        currentValue: {
          usd: positionUsdValue,
        },
        pnl: {
          realized: 0,
          unrealized: 0,
          percentage: 0,
        },
        feesEarned: {
          tokenA: 0,
          tokenB: 0,
          usd: 0,
        },
        impermanentLoss: {
          percentage: 0,
          usd: 0,
        },
        status: 'active',
        inRange: true,
        aiConfidence: decision.confidence,
        riskScore: decision.riskScore,
        expectedAPR: decision.expectedAPR,
        entryTxSignature: swapSignature || 'pending',
      };

      const position = await this.db.createPosition(positionData);

      // Add to active positions
      this.activePositions.set(position.id, position);

      // Log trade
      tradeLogger.info('Position created', {
        positionId: position.id,
        poolAddress: decision.poolAddress,
        strategy: decision.strategy,
        investmentUsd: positionUsdValue,
        entryPrice: currentPrice,
        aiConfidence: decision.confidence,
      });

      logger.info(`✅ Position created: ${position.id}`);

      return position;

    } catch (error) {
      logger.error('❌ Failed to create position:', error);
      throw error;
    }
  }

  // ==========================================
  // POSITION MONITORING
  // ==========================================

  async updatePositionMetrics(positionId: string): Promise<Position> {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Get current pool price
      const currentPrice = await this.meteoraService.getPoolPrice(position.poolAddress);

      // Check if in range
      const inRange = currentPrice >= position.range.lower && currentPrice <= position.range.upper;

      // Calculate PnL
      const pnl = this.calculatePnL(position, currentPrice);

      // Calculate fees
      const fees = await this.meteoraService.calculateFees(position.id);

      // Calculate IL
      const il = this.calculateImpermanentLoss(position, currentPrice);

      // Update position
      const updatedPosition = await this.db.updatePosition(positionId, {
        currentPrice,
        currentValue: {
          usd: position.investment.usd + pnl.unrealized,
        },
        pnl,
        feesEarned: {
          tokenA: fees.tokenX,
          tokenB: fees.tokenY,
          usd: fees.usdValue,
        },
        impermanentLoss: il,
        inRange,
      });

      // Update in-memory cache
      this.activePositions.set(positionId, updatedPosition);

      return updatedPosition;

    } catch (error) {
      logger.error(`Error updating position ${positionId}:`, error);
      throw error;
    }
  }

  async updateAllPositions(): Promise<Position[]> {
    const updatedPositions: Position[] = [];

    for (const [positionId, position] of this.activePositions) {
      if (position.status === 'active') {
        try {
          const updated = await this.updatePositionMetrics(positionId);
          updatedPositions.push(updated);
        } catch (error) {
          logger.error(`Failed to update position ${positionId}:`, error);
        }
      }
    }

    return updatedPositions;
  }

  // ==========================================
  // POSITION EXIT
  // ==========================================

  async closePosition(
    positionId: string,
    exitData: {
      exitPrice: number;
      exitTxSignature: string;
    }
  ): Promise<Position> {
    try {
      logger.info('📊 Closing position...');
      logger.info(`   Position: ${positionId}`);

      const position = this.activePositions.get(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Calculate final PnL
      const pnl = this.calculatePnL(position, exitData.exitPrice);

      // Close position in database
      const closedPosition = await this.db.closePosition(positionId, {
        exitPrice: exitData.exitPrice,
        pnl,
        exitTxSignature: exitData.exitTxSignature,
      });

      // Remove from active positions
      this.activePositions.delete(positionId);

      // Log trade
      tradeLogger.info('Position closed', {
        positionId,
        exitPrice: exitData.exitPrice,
        realizedPnl: pnl.realized,
        totalReturn: pnl.percentage,
        exitTxSignature: exitData.exitTxSignature,
      });

      logger.info(`✅ Position closed: ${positionId}`);
      logger.info(`   Realized PnL: $${pnl.realized.toFixed(2)} (${pnl.percentage.toFixed(2)}%)`);

      return closedPosition;

    } catch (error) {
      logger.error(`❌ Failed to close position ${positionId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // REBALANCE OPERATIONS
  // ==========================================

  async checkRebalanceNeeded(positionId: string): Promise<RebalanceDecision> {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        return {
          action: 'HOLD',
          reason: 'Position not found',
        };
      }

      // Update metrics first
      const updated = await this.updatePositionMetrics(positionId);

      // Check if out of range
      if (!updated.inRange) {
        return {
          action: 'REBALANCE_IMMEDIATE',
          reason: 'OUT_OF_RANGE',
          newRange: await this.calculateNewRange(updated),
        };
      }

      // Check profit target
      if (updated.pnl.percentage >= config.trading.takeProfitPercentage * 100) {
        return {
          action: 'REBALANCE_OPTIONAL',
          reason: 'PROFIT_TARGET',
        };
      }

      // Check stop loss
      if (updated.pnl.percentage <= -config.trading.stopLossPercentage * 100) {
        return {
          action: 'EXIT',
          reason: 'STOP_LOSS',
        };
      }

      // Check IL threshold
      if (updated.impermanentLoss.percentage > 0.03) {
        return {
          action: 'REBALANCE_OPTIONAL',
          reason: 'IL_THRESHOLD',
        };
      }

      return {
        action: 'HOLD',
        reason: 'NO_ACTION_NEEDED',
      };

    } catch (error) {
      logger.error(`Error checking rebalance for ${positionId}:`, error);
      return {
        action: 'HOLD',
        reason: 'ERROR',
      };
    }
  }

  async rebalancePosition(
    positionId: string,
    newRange?: { lower: number; upper: number }
  ): Promise<Position> {
    try {
      logger.info('🔄 Rebalancing position...');
      logger.info(`   Position: ${positionId}`);

      const position = this.activePositions.get(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Calculate new range if not provided
      const range = newRange || await this.calculateNewRange(position);

      // Calculate new bin range
      const binRange = await this.meteoraService.calculateOptimalBinRange(
        position.poolAddress,
        position.strategy === 'alpha' ? 'narrow' : position.strategy === 'range' ? 'medium' : 'wide'
      );

      // Execute rebalance
      const result = await this.meteoraService.rebalancePosition({
        poolAddress: position.poolAddress,
        positionAddress: position.id, // Would need actual Meteora position address
        newStrategyParams: {
          strategyType: this.mapStrategyToDLMM(position.strategy),
          minBinId: binRange.minBinId,
          maxBinId: binRange.maxBinId,
        },
      });

      // Update position
      const updatedPosition = await this.db.updatePosition(positionId, {
        range,
        lastRebalance: new Date(),
      });

      // Update cache
      this.activePositions.set(positionId, updatedPosition);

      // Log trade
      tradeLogger.info('Position rebalanced', {
        positionId,
        oldRange: `${position.range.lower}-${position.range.upper}`,
        newRange: `${range.lower}-${range.upper}`,
        txSignature: result.signature,
      });

      logger.info(`✅ Position rebalanced: ${positionId}`);

      return updatedPosition;

    } catch (error) {
      logger.error(`❌ Failed to rebalance position ${positionId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // CALCULATIONS
  // ==========================================

  private calculatePnL(position: Position, currentPrice: number): PnL {
    const entryPrice = position.entryPrice;
    const priceChange = (currentPrice - entryPrice) / entryPrice;
    
    // Unrealized PnL from price movement
    const unrealizedUsd = position.investment.usd * priceChange;
    
    // Add fees earned
    const totalFees = position.feesEarned.usd;
    
    // Total PnL
    const totalUnrealized = unrealizedUsd + totalFees;
    const percentage = (totalUnrealized / position.investment.usd) * 100;

    return {
      realized: position.pnl.realized, // Keep existing realized PnL
      unrealized: totalUnrealized,
      percentage,
    };
  }

  private calculateImpermanentLoss(
    position: Position,
    currentPrice: number
  ): { percentage: number; usd: number } {
    const entryPrice = position.entryPrice;
    const priceRatio = currentPrice / entryPrice;
    const sqrtPriceRatio = Math.sqrt(priceRatio);
    
    // IL formula: 2 * sqrt(p) / (1 + p) - 1
    const il = (2 * sqrtPriceRatio) / (1 + priceRatio) - 1;
    const ilUsd = Math.abs(il) * position.investment.usd;

    return {
      percentage: Math.abs(il) * 100,
      usd: ilUsd,
    };
  }

  private async calculateNewRange(position: Position): Promise<{ lower: number; upper: number }> {
    const currentPrice = await this.meteoraService.getPoolPrice(position.poolAddress);
    
    // Get pool volatility for range width
    const pool = await this.meteoraService.getPool(position.poolAddress);
    const volatility = pool.volatility;
    
    // Base width by strategy
    let width = 0.1; // 10%
    if (position.strategy === 'alpha') width = 0.05;
    if (position.strategy === 'range') width = 0.15;
    if (position.strategy === 'momentum') width = 0.1;
    
    // Adjust for volatility
    width *= (1 + volatility);
    
    // Cap at 50%
    width = Math.min(0.5, width);

    return {
      lower: currentPrice * (1 - width),
      upper: currentPrice * (1 + width),
    };
  }

  // ==========================================
  // GETTERS
  // ==========================================

  getPosition(positionId: string): Position | undefined {
    return this.activePositions.get(positionId);
  }

  getAllPositions(): Position[] {
    return Array.from(this.activePositions.values());
  }

  getActivePositions(): Position[] {
    return this.getAllPositions().filter(p => p.status === 'active');
  }

  getPositionsByPool(poolAddress: string): Position[] {
    return this.getAllPositions().filter(p => p.poolAddress === poolAddress);
  }

  getPositionsByStrategy(strategy: StrategyType): Position[] {
    return this.getAllPositions().filter(p => p.strategy === strategy);
  }

  // ==========================================
  // MONITORING
  // ==========================================

  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    this.monitorInterval = setInterval(async () => {
      try {
        await this.updateAllPositions();
        
        // Check for rebalance opportunities
        for (const [positionId, position] of this.activePositions) {
          if (position.status === 'active') {
            const decision = await this.checkRebalanceNeeded(positionId);
            
            if (decision.action === 'REBALANCE_IMMEDIATE') {
              logger.info(`⚡ Auto-rebalance triggered for ${positionId}`);
              // Would trigger rebalance here or notify
            }
          }
        }
        
      } catch (error) {
        logger.error('Error in position monitoring:', error);
      }
    }, intervalMs);

    logger.info(`📊 Position monitoring started (${intervalMs}ms interval)`);
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    logger.info('📊 Position monitoring stopped');
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  private mapStrategyToDLMM(strategy: StrategyType): 'spot' | 'bidAsk' | 'curve' {
    const map: Record<StrategyType, 'spot' | 'bidAsk' | 'curve'> = {
      'alpha': 'spot',
      'range': 'spot',
      'momentum': 'bidAsk',
    };
    return map[strategy] || 'spot';
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async disconnect(): Promise<void> {
    this.stopMonitoring();
    this.activePositions.clear();
    logger.info('📊 Position manager disconnected');
  }
}

export default PositionManager;
