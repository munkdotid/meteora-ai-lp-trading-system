// ==========================================
// MAIN ENTRY POINT
// AI LP Trading System
// ==========================================

import 'reflect-metadata';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { TradingEngine } from './services/TradingEngine';
import { DatabaseService } from './services/DatabaseService';
import { RedisService } from './services/RedisService';
import { TelegramBotManager } from './telegram/BotManager';
import { APIServer } from './api/Server';
import { HealthCheckServer } from './api/HealthCheck';

// Global service instances
let tradingEngine: TradingEngine;
let telegramBot: TelegramBotManager;
let apiServer: APIServer;
let healthCheckServer: HealthCheckServer;

// ==========================================
// INITIALIZATION
// ==========================================

async function bootstrap(): Promise<void> {
  try {
    logger.info('🚀 Starting AI LP Trading System...');
    
    // Validate configuration
    validateConfig();
    logger.info('✅ Configuration validated');
    
    // Initialize database
    const dbService = new DatabaseService();
    await dbService.connect();
    logger.info('✅ Database connected');
    
    // Initialize Redis
    const redisService = new RedisService();
    await redisService.connect();
    logger.info('✅ Redis connected');
    
    // Initialize trading engine
    tradingEngine = new TradingEngine(dbService, redisService);
    await tradingEngine.initialize();
    logger.info('✅ Trading engine initialized');
    
    // Initialize Telegram bot
    telegramBot = new TelegramBotManager(tradingEngine, redisService);
    await telegramBot.initialize();
    logger.info('✅ Telegram bot initialized');
    
    // Initialize API server
    apiServer = new APIServer(tradingEngine, dbService, redisService);
    await apiServer.start(config.port);
    logger.info(`✅ API server started on port ${config.port}`);
    
    // Initialize health check server
    healthCheckServer = new HealthCheckServer(tradingEngine, dbService, redisService);
    await healthCheckServer.start(3001);
    logger.info('✅ Health check server started on port 3001');
    
    // Start trading engine (if auto-trading enabled)
    if (config.features.autoTrading) {
      await tradingEngine.start();
      logger.info('✅ Auto-trading started');
    } else {
      logger.info('⏸️ Auto-trading disabled (manual mode)');
    }
    
    logger.info('🎉 System fully initialized and running');
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
  } catch (error) {
    logger.error('❌ Failed to start system:', error);
    process.exit(1);
  }
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received. Starting graceful shutdown...`);
    
    try {
      // Stop trading engine
      if (tradingEngine) {
        await tradingEngine.stop();
        logger.info('⏹️ Trading engine stopped');
      }
      
      // Stop Telegram bot
      if (telegramBot) {
        await telegramBot.stop();
        logger.info('⏹️ Telegram bot stopped');
      }
      
      // Stop API server
      if (apiServer) {
        await apiServer.stop();
        logger.info('⏹️ API server stopped');
      }
      
      // Stop health check server
      if (healthCheckServer) {
        await healthCheckServer.stop();
        logger.info('⏹️ Health check server stopped');
      }
      
      logger.info('👋 Graceful shutdown complete');
      process.exit(0);
      
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
}

// ==========================================
// START
// ==========================================

bootstrap();
