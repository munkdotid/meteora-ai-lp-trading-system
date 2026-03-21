// ==========================================
// TRADING ENGINE
// Main orchestration engine that coordinates all agents
// ==========================================

import { ScoutAgent } from '../agents/ScoutAgent';
import { AnalystAgent } from '../agents/AnalystAgent';
import { RiskManager } from '../agents/RiskManager';
import { ExecutorAgent } from './ExecutorAgent';
import { MeteoraService } from './MeteoraService';
import { JupiterService } from './JupiterService';
import { WalletService } from './WalletService';
import { PositionManager } from './PositionManager';
import { DatabaseService } from './DatabaseService';
import { RedisService } from './RedisService';
import { NotificationService } from './NotificationService';
import { config } from '../config';
import { logger, tradeLogger, aiLogger } from '../utils/logger';
import {
  Position,
  AIDecision,
  SystemStatus,
  StrategyType,
  PoolAnalysis,
  RiskAssessment,
  TradeIntent,
} from '../types';
import cron from 'node-cron';

export class TradingEngine {
  // Agents
  private scoutAgent: ScoutAgent;
  private analystAgent: AnalystAgent;
  private riskManager: RiskManager;
  private executorAgent: ExecutorAgent;

  // Services
  private meteoraService: MeteoraService;
  private jupiterService: JupiterService;
  private walletService: WalletService;
  private positionManager: PositionManager;
  private db: DatabaseService;
  private redis: RedisService;
  private notificationService: NotificationService;

  // State
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastScanTime: Date | null = null;
  private scanInterval: NodeJS.Timeout | null = null;
  private rebalanceInterval: NodeJS.Timeout | null = null;
  private dailyReportJob: cron.ScheduledTask | null = null;

  // Stats
  private totalTrades: number = 0;
  private successfulTrades: number = 0;
  private failedTrades: number = 0;
  private todayPnL: number = 0;

  // Rate limiting
  private lastTradeTime: Date = new Date(0);
  private readonly minTimeBetweenTradesMs: number = 5000; // 5 seconds minimum
  private tradeCounter: number = 0;
  private readonly maxTradesPerMinute: number = 12; // Max 12 trades per minute
  private tradeWindowStart: Date = new Date();

  constructor(db: DatabaseService, redis: RedisService) {
    this.db = db;
    this.redis = redis;

    // Initialize services
    this.walletService = new WalletService();
    this.meteoraService = new MeteoraService(this.walletService);
    this.jupiterService = new JupiterService(this.walletService);
    
    this.positionManager = new PositionManager(
      this.db,
      this.meteoraService,
      this.jupiterService,
      this.walletService
    );

    this.notificationService = new NotificationService(this.redis);

    this.executorAgent = new ExecutorAgent(
      this.meteoraService,
      this.jupiterService,
      this.walletService,
      this.db
    );

    // Initialize agents
    this.scoutAgent = new ScoutAgent(this.meteoraService);
    this.analystAgent = new AnalystAgent(this.scoutAgent);
    this.riskManager = new RiskManager();
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('🚀 Initializing trading engine...');

    try {
      // Initialize wallet first (required for other services)
      await this.walletService.initialize();

      // Initialize other services
      await Promise.all([
        this.meteoraService.initialize(),
        this.jupiterService.initialize(),
        this.positionManager.initialize(),
        this.executorAgent.initialize(),
        this.notificationService.initialize(),
      ]);

      // Load stats from database
      await this.loadStats();

      logger.info('✅ Trading engine initialized');
      logger.info(`   Wallet: ${this.walletService.getPublicKeyString()}`);

    } catch (error) {
      logger.error('❌ Failed to initialize trading engine:', error);
      throw error;
    }
  }

  private async loadStats(): Promise<void> {
    try {
      // Load today's performance
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // This would fetch from database in production
      this.totalTrades = 0;
      this.successfulTrades = 0;
      this.failedTrades = 0;
      this.todayPnL = 0;

    } catch (error) {
      logger.error('Error loading stats:', error);
    }
  }

  // ==========================================
  // START / STOP
  // ==========================================

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trading engine is already running');
      return;
    }

    if (!config.features.autoTrading) {
      logger.info('Auto-trading is disabled in configuration');
      return;
    }

    logger.info('🚀 Starting trading engine...');

    try {
      this.isRunning = true;
      this.isPaused = false;

      // Start position monitoring
      this.positionManager.startMonitoring(30000); // 30 seconds

      // Start scan loop
      this.startScanLoop();

      // Start rebalance loop
      this.startRebalanceLoop();

      // Schedule daily report
      this.scheduleDailyReport();

      // Schedule daily stats reset
      this.scheduleDailyReset();

      logger.info('✅ Trading engine started');
      logger.info(`   Scan interval: ${config.trading.updateInterval / 1000}s`);
      logger.info(`   Rebalance interval: ${config.trading.rebalanceInterval / 1000}s`);

      // Notify
      await this.notificationService.sendSystemNotification('Bot started', {
        wallet: this.walletService.getPublicKeyString(),
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('❌ Failed to start trading engine:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping trading engine...');

    try {
      this.isRunning = false;

      // Stop intervals
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }

      if (this.rebalanceInterval) {
        clearInterval(this.rebalanceInterval);
        this.rebalanceInterval = null;
      }

      if (this.dailyReportJob) {
        this.dailyReportJob.stop();
        this.dailyReportJob = null;
      }

      // Stop monitoring
      this.positionManager.stopMonitoring();

      logger.info('✅ Trading engine stopped');

      // Notify
      await this.notificationService.sendSystemNotification('Bot stopped', {
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error stopping trading engine:', error);
    }
  }

  pause(): void {
    if (!this.isRunning) return;
    
    this.isPaused = true;
    logger.info('⏸️ Trading engine paused');
  }

  resume(): void {
    if (!this.isRunning) return;
    
    this.isPaused = false;
    logger.info('▶️ Trading engine resumed');
  }

  // ==========================================
  // RATE LIMITING
  // ==========================================

  /**
   * Check if trading is allowed based on rate limits
   * Returns true if trade can proceed, false if rate limited
   */
  private canTrade(): boolean {
    const now = Date.now();
    
    // Check minimum time between trades
    const timeSinceLastTrade = now - this.lastTradeTime.getTime();
    if (timeSinceLastTrade < this.minTimeBetweenTradesMs) {
      logger.debug(`Rate limited: ${this.minTimeBetweenTradesMs - timeSinceLastTrade}ms remaining`);
      return false;
    }

    // Reset counter if window has passed
    if (now - this.tradeWindowStart.getTime() > 60000) {
      this.tradeCounter = 0;
      this.tradeWindowStart = new Date();
    }

    // Check max trades per minute
    if (this.tradeCounter >= this.maxTradesPerMinute) {
      const remainingTime = 60000 - (now - this.tradeWindowStart.getTime());
      logger.warn(`Rate limited: Max trades per minute reached. Reset in ${Math.ceil(remainingTime / 1000)}s`);
      return false;
    }

    return true;
  }

  /**
   * Record that a trade was executed
   */
  private recordTrade(): void {
    this.lastTradeTime = new Date();
    this.tradeCounter++;
  }

  // ==========================================
  // MAIN SCAN LOOP
  // ==========================================

  private startScanLoop(): void {
    // Immediate first scan
    this.performScan();

    // Schedule recurring scans
    this.scanInterval = setInterval(() => {
      this.performScan();
    }, config.trading.updateInterval);
  }

  private async performScan(): Promise<void> {
    if (this.isPaused) {
      logger.debug('Scan skipped - engine is paused');
      return;
    }

    try {
      logger.info('🔍 Starting market scan...');
      const startTime = Date.now();

      // 1. Scout: Scan all pools
      const poolAnalyses = await this.scoutAgent.scanAllPools();
      logger.info(`📊 Scanned ${poolAnalyses.length} pools`);

      // 2. Filter high-opportunity pools
      const topPools = poolAnalyses
        .filter(p => p.recommendation === 'high' || p.recommendation === 'medium')
        .slice(0, 10); // Top 10

      logger.info(`🎯 ${topPools.length} high-opportunity pools found`);

      // 3. Analyze each top pool
      for (const poolAnalysis of topPools) {
        await this.evaluateAndExecute(poolAnalysis);
      }

      // 4. Update last scan time
      this.lastScanTime = new Date();

      const scanTime = Date.now() - startTime;
      logger.info(`✅ Scan complete in ${scanTime}ms`);

    } catch (error) {
      logger.error('Error in scan loop:', error);
    }
  }

  private async evaluateAndExecute(poolAnalysis: PoolAnalysis): Promise<void> {
    try {
      const { pool, opportunityScore } = poolAnalysis;

      // Check if we already have a position in this pool
      const existingPositions = this.positionManager.getPositionsByPool(pool.address);
      if (existingPositions.length > 0) {
        logger.debug(`Already have position in ${pool.tokenA.symbol}/${pool.tokenB.symbol}, skipping`);
        return;
      }

      // Check if we have max positions
      const activePositions = this.positionManager.getActivePositions();
      if (activePositions.length >= config.trading.maxPositions) {
        logger.debug('Max positions reached, skipping');
        return;
      }

      // 1. Analyst: Deep analysis
      const decision = await this.analystAgent.analyzeOpportunity(poolAnalysis);

      aiLogger.info('AI Decision', {
        pool: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,
        action: decision.action,
        confidence: decision.confidence,
        expectedAPR: decision.expectedAPR,
      });

      // 2. Check if we should enter
      if (decision.action !== 'enter') {
        logger.debug(`Decision for ${pool.tokenA.symbol}/${pool.tokenB.symbol}: ${decision.action}`);
        
        // Store decision for learning
        await this.db.createAIDecision(decision);
        return;
      }

      // 3. Risk Manager: Validate trade
      const walletBalance = await this.walletService.getBalance();
      const solPrice = 100; // Placeholder
      const availableCapital = walletBalance * solPrice;

      const riskAssessment = await this.riskManager.validateTrade(
        {
          type: 'entry',
          poolAddress: pool.address,
          amount: availableCapital * (decision.positionSize || 0.2),
          strategy: decision.strategy,
        },
        availableCapital,
        activePositions
      );

      if (riskAssessment.overallRisk === 'critical' || riskAssessment.overallRisk === 'high') {
        logger.warn(`Trade rejected by risk manager: ${riskAssessment.overallRisk}`);
        
        if (riskAssessment.warnings.length > 0) {
          logger.warn(`   Warnings: ${riskAssessment.warnings.map(w => w.message).join(', ')}`);
        }

        // Update decision as rejected
        decision.action = 'skip';
        await this.db.createAIDecision(decision);
        return;
      }

      // 4. Check rate limiting before execution
      if (!this.canTrade()) {
        logger.warn(`Rate limit active - skipping entry for ${pool.tokenA.symbol}/${pool.tokenB.symbol}`);
        return;
      }

      // 5. Executor: Execute entry
      if (!config.features.dryRun) {
        logger.info(`🚀 Executing entry for ${pool.tokenA.symbol}/${pool.tokenB.symbol}`);

        const result = await this.executorAgent.executeEntry(
          decision,
          availableCapital * riskAssessment.positionSize
        );

        if (result.success) {
          // Create position record
          const position = await this.positionManager.createPosition(decision);

          // Update AI decision
          await this.db.updateAIDecisionResult(decision.id, {
            success: true,
            pnl: 0,
          });

          // Update stats
          this.totalTrades++;
          this.successfulTrades++;

          // Update risk manager
          this.riskManager.updatePosition(position);

          // Record trade for rate limiting
          this.recordTrade();

          // Notify
          await this.notificationService.notifyEntry(position);

          logger.info('✅ Entry successful', { positionId: position.id.slice(0, 8) + '...' });
        } else {
          logger.error(`❌ Entry failed: ${result.error}`);
          
          await this.db.updateAIDecisionResult(decision.id, {
            success: false,
            pnl: 0,
          });

          this.totalTrades++;
          this.failedTrades++;
        }
      } else {
        logger.info('⏸️ Dry run mode - would execute entry');
      }

    } catch (error) {
      logger.error('Error in evaluateAndExecute:', error);
    }
  }

  // ==========================================
  // REBALANCE LOOP
  // ==========================================

  private startRebalanceLoop(): void {
    if (!config.features.autoRebalance) {
      logger.info('Auto-rebalance is disabled');
      return;
    }

    this.rebalanceInterval = setInterval(() => {
      this.performRebalanceCheck();
    }, config.trading.rebalanceInterval);
  }

  private async performRebalanceCheck(): Promise<void> {
    if (this.isPaused) return;

    try {
      const activePositions = this.positionManager.getActivePositions();
      
      logger.debug(`Checking ${activePositions.length} positions for rebalance...`);

      for (const position of activePositions) {
        try {
          // Check rebalance needed
          const decision = await this.positionManager.checkRebalanceNeeded(position.id);

          if (decision.action === 'REBALANCE_IMMEDIATE' || decision.action === 'REBALANCE_OPTIONAL') {
            logger.info(`🔄 Rebalance needed for ${position.id}: ${decision.reason}`);

            if (!config.features.dryRun) {
              const result = await this.executorAgent.executeRebalance(
                position,
                decision.newRange
              );

              if (result.success) {
                // Update position
                await this.positionManager.rebalancePosition(position.id, decision.newRange);

                // Notify
                await this.notificationService.notifyRebalance(position, decision.reason);

                logger.info(`✅ Rebalance complete: ${position.id}`);
              } else {
                logger.error(`❌ Rebalance failed: ${result.error}`);
              }
            } else {
              logger.info('⏸️ Dry run mode - would rebalance');
            }
          }

          if (decision.action === 'EXIT') {
            logger.info(`🚪 Exit triggered for ${position.id}: ${decision.reason}`);

            if (!config.features.dryRun) {
              const result = await this.executorAgent.executeExit(position);

              if (result.success) {
                // Close position
                const currentPrice = await this.meteoraService.getPoolPrice(position.poolAddress);
                
                await this.positionManager.closePosition(position.id, {
                  exitPrice: currentPrice,
                  exitTxSignature: 'pending', // Would get from result
                });

                // Update risk manager
                this.riskManager.removePosition(position.id);

                // Update stats
                this.todayPnL += position.pnl.realized;

                // Notify
                await this.notificationService.notifyExit(position);

                logger.info(`✅ Exit complete: ${position.id}`);
              } else {
                logger.error(`❌ Exit failed: ${result.error}`);
              }
            } else {
              logger.info('⏸️ Dry run mode - would exit');
            }
          }

        } catch (error) {
          logger.error(`Error checking rebalance for ${position.id}:`, error);
        }
      }

    } catch (error) {
      logger.error('Error in rebalance check:', error);
    }
  }

  // ==========================================
  // DAILY REPORTS & RESETS
  // ==========================================

  private scheduleDailyReport(): void {
    const [hour, minute] = config.notifications.dailyReportTime.split(':');
    
    this.dailyReportJob = cron.schedule(`${minute} ${hour} * * *`, async () => {
      await this.generateDailyReport();
    });
  }

  private scheduleDailyReset(): void {
    cron.schedule('0 0 * * *', async () => {
      logger.info('🔄 Performing daily reset...');
      
      // Reset risk manager daily stats
      this.riskManager.resetDailyStats();
      
      // Reset local stats
      this.todayPnL = 0;
      
      // Save performance record
      await this.saveDailyPerformance();
      
      logger.info('✅ Daily reset complete');
    });
  }

  private async generateDailyReport(): Promise<void> {
    try {
      const positions = this.positionManager.getActivePositions();
      const balance = await this.walletService.getBalance();

      const report = {
        date: new Date(),
        balance,
        positions: positions.length,
        todayPnL: this.todayPnL,
        totalTrades: this.totalTrades,
      };

      await this.notificationService.sendDailyReport(report);

    } catch (error) {
      logger.error('Error generating daily report:', error);
    }
  }

  private async saveDailyPerformance(): Promise<void> {
    try {
      const walletBalance = await this.walletService.getBalance();
      const solPrice = 100; // Placeholder
      const totalValue = walletBalance * solPrice;

      await this.db.createPerformanceRecord({
        date: new Date(),
        startingBalance: totalValue, // Would track this properly
        endingBalance: totalValue,
        realizedPnL: this.todayPnL,
        unrealizedPnL: 0,
        feesEarned: 0,
        impermanentLoss: 0,
        totalTrades: this.totalTrades,
        winningTrades: this.successfulTrades,
        losingTrades: this.failedTrades,
        winRate: this.totalTrades > 0 ? this.successfulTrades / this.totalTrades : 0,
      });

    } catch (error) {
      logger.error('Error saving daily performance:', error);
    }
  }

  // ==========================================
  // EMERGENCY STOP
  // ==========================================

  async emergencyStop(): Promise<void> {
    logger.error('🚨 EMERGENCY STOP TRIGGERED');

    try {
      // Stop all operations
      this.pause();

      // Close all positions
      const activePositions = this.positionManager.getActivePositions();
      
      for (const position of activePositions) {
        try {
          logger.info(`🚪 Emergency exit: ${position.id}`);
          
          const result = await this.executorAgent.executeExit(position);
          
          if (result.success) {
            await this.positionManager.closePosition(position.id, {
              exitPrice: 0,
              exitTxSignature: 'emergency',
            });
          }
        } catch (error) {
          logger.error(`Failed to emergency exit ${position.id}:`, error);
        }
      }

      // Notify
      await this.notificationService.sendEmergencyAlert('Emergency stop executed - all positions closed');

      // Stop engine
      await this.stop();

      logger.info('🚨 Emergency stop complete');

    } catch (error) {
      logger.error('Error during emergency stop:', error);
    }
  }

  // ==========================================
  // GETTERS
  // ==========================================

  getStatus(): SystemStatus {
    return {
      running: this.isRunning,
      walletAddress: this.walletService.getPublicKeyString(),
      balance: { sol: 0, usd: 0 }, // Would fetch actual balance
      activePositions: this.positionManager.getActivePositions().length,
      totalPositions: this.positionManager.getAllPositions().length,
      todayPnL: this.todayPnL,
      totalPnL: 0, // Would calculate from history
      lastUpdate: this.lastScanTime || new Date(),
      uptime: 0, // Would track actual uptime
      ai: {
        mode: 'range' as StrategyType,
        confidence: 0.8,
        nextScan: this.lastScanTime
          ? config.trading.updateInterval - (Date.now() - this.lastScanTime.getTime())
          : 0,
      },
    };
  }

  getActivePositions(): Position[] {
    return this.positionManager.getActivePositions();
  }

  getAllPositions(): Position[] {
    return this.positionManager.getAllPositions();
  }

  // ==========================================
  // MANUAL OPERATIONS
  // ==========================================

  async forceRebalance(positionId: string): Promise<boolean> {
    try {
      const position = this.positionManager.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      const result = await this.executorAgent.executeRebalance(position);

      if (result.success) {
        await this.positionManager.rebalancePosition(positionId);
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`Manual rebalance failed for ${positionId}:`, error);
      return false;
    }
  }

  async forceExit(positionId: string): Promise<boolean> {
    try {
      const position = this.positionManager.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      const result = await this.executorAgent.executeExit(position);

      if (result.success) {
        await this.positionManager.closePosition(positionId, {
          exitPrice: 0,
          exitTxSignature: 'manual',
        });
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`Manual exit failed for ${positionId}:`, error);
      return false;
    }
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async disconnect(): Promise<void> {
    await this.stop();
    await this.positionManager.disconnect();
    await this.meteoraService.disconnect();
    await this.executorAgent.disconnect();
    logger.info('🚀 Trading engine disconnected');
  }
}

export default TradingEngine;
