// ==========================================
// CONFIGURATION
// Centralized config management
// ==========================================

import dotenv from 'dotenv';
import { z } from 'zod';
import { StrategyType } from '../types';

// Load environment variables
dotenv.config();

// ------------------------------------------
// Validation Schemas
// ------------------------------------------

const envSchema = z.object({
  // System
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Solana
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_WALLET_PRIVATE_KEY: z.string().optional(),
  WALLET_KEY_PATH: z.string().optional(),
  
  // Meteora
  METEORA_API_ENDPOINT: z.string().url().default('https://dlmm-api.meteora.ag'),
  
  // Jupiter
  JUPITER_API_URL: z.string().url().default('https://quote-api.jup.ag/v6'),
  JUPITER_API_KEY: z.string().optional(),
  DEFAULT_SLIPPAGE_BPS: z.string().default('50'),
  MAX_SLIPPAGE_BPS: z.string().default('200'),
  
  // Database
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  AUTHORIZED_USERS: z.string(),
  ADMIN_USERS: z.string().optional(),
  
  // Trading
  MAX_POSITIONS: z.string().default('5'),
  MAX_PER_POOL: z.string().default('0.20'),
  MIN_POOL_AGE_HOURS: z.string().default('24'),
  MIN_POOL_TVL: z.string().default('500000'),
  MIN_VOLUME_24H: z.string().default('100000'),
  MAX_VOLATILITY: z.string().default('0.50'),
  UPDATE_INTERVAL: z.string().default('180'),
  REBALANCE_INTERVAL: z.string().default('180'),
  MIN_AI_CONFIDENCE: z.string().default('0.75'),
  STOP_LOSS_PERCENTAGE: z.string().default('0.03'),
  TAKE_PROFIT_PERCENTAGE: z.string().default('0.05'),
  DAILY_LOSS_LIMIT: z.string().default('0.05'),
  MAX_DRAWDOWN: z.string().default('0.10'),
  CASH_RESERVE: z.string().default('0.10'),
  
  // Gas
  MAX_GAS_PRICE: z.string().default('10000'),
  PRIORITY_FEE: z.string().default('10000'),
  USE_JITO_BUNDLES: z.string().default('true'),
  JITO_TIP_AMOUNT: z.string().default('0.0001'),
  
  // AI
  ENABLE_AI_PREDICTION: z.string().default('true'),
  MODEL_UPDATE_FREQUENCY: z.string().default('100'),
  STRATEGY_WEIGHT_ALPHA: z.string().default('0.30'),
  STRATEGY_WEIGHT_RANGE: z.string().default('0.50'),
  STRATEGY_WEIGHT_MOMENTUM: z.string().default('0.20'),
  
  // Notifications
  ENABLE_TELEGRAM_NOTIFICATIONS: z.string().default('true'),
  NOTIFY_PROFIT_THRESHOLD: z.string().default('0.05'),
  NOTIFY_LOSS_THRESHOLD: z.string().default('-0.03'),
  DAILY_REPORT_TIME: z.string().default('09:00'),
  
  // Security
  JWT_SECRET: z.string(),
  ENCRYPTION_KEY: z.string(),
  
  // Feature flags
  ENABLE_AUTO_TRADING: z.string().default('true'),
  ENABLE_AUTO_REBALANCE: z.string().default('true'),
  DRY_RUN: z.string().default('false'),
  DEBUG: z.string().default('false'),
});

// ------------------------------------------
// Parse and validate
// ------------------------------------------

const env = envSchema.parse(process.env);

// ------------------------------------------
// Export Config
// ------------------------------------------

export const config = {
  // System
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT, 10),
  logLevel: env.LOG_LEVEL,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  
  // Solana
  solana: {
    rpcUrl: env.SOLANA_RPC_URL,
    privateKey: env.SOLANA_WALLET_PRIVATE_KEY,
    keyPath: env.WALLET_KEY_PATH,
  },
  
  // Meteora
  meteora: {
    apiEndpoint: env.METEORA_API_ENDPOINT,
  },
  
  // Jupiter
  jupiter: {
    apiUrl: env.JUPITER_API_URL,
    apiKey: env.JUPITER_API_KEY,
    defaultSlippageBps: parseInt(env.DEFAULT_SLIPPAGE_BPS, 10),
    maxSlippageBps: parseInt(env.MAX_SLIPPAGE_BPS, 10),
  },
  
  // Database
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  
  // Telegram
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    authorizedUsers: env.AUTHORIZED_USERS.split(',').map(id => id.trim()),
    adminUsers: env.ADMIN_USERS?.split(',').map(id => id.trim()) || [],
  },
  
  // Trading
  trading: {
    maxPositions: parseInt(env.MAX_POSITIONS, 10),
    maxPerPool: parseFloat(env.MAX_PER_POOL),
    minPoolAgeHours: parseInt(env.MIN_POOL_AGE_HOURS, 10),
    minPoolTVL: parseInt(env.MIN_POOL_TVL, 10),
    minVolume24h: parseInt(env.MIN_VOLUME_24H, 10),
    maxVolatility: parseFloat(env.MAX_VOLATILITY),
    updateInterval: parseInt(env.UPDATE_INTERVAL, 10) * 1000, // Convert to ms
    rebalanceInterval: parseInt(env.REBALANCE_INTERVAL, 10) * 1000,
    minAIConfidence: parseFloat(env.MIN_AI_CONFIDENCE),
    stopLossPercentage: parseFloat(env.STOP_LOSS_PERCENTAGE),
    takeProfitPercentage: parseFloat(env.TAKE_PROFIT_PERCENTAGE),
    dailyLossLimit: parseFloat(env.DAILY_LOSS_LIMIT),
    maxDrawdown: parseFloat(env.MAX_DRAWDOWN),
    cashReserve: parseFloat(env.CASH_RESERVE),
  },
  
  // Gas
  gas: {
    maxGasPrice: parseInt(env.MAX_GAS_PRICE, 10),
    priorityFee: parseInt(env.PRIORITY_FEE, 10),
    useJitoBundles: env.USE_JITO_BUNDLES === 'true',
    jitoTipAmount: parseFloat(env.JITO_TIP_AMOUNT),
  },
  
  // AI
  ai: {
    enabled: env.ENABLE_AI_PREDICTION === 'true',
    modelUpdateFrequency: parseInt(env.MODEL_UPDATE_FREQUENCY, 10),
    strategyWeights: {
      alpha: parseFloat(env.STRATEGY_WEIGHT_ALPHA),
      range: parseFloat(env.STRATEGY_WEIGHT_RANGE),
      momentum: parseFloat(env.STRATEGY_WEIGHT_MOMENTUM),
    } as Record<StrategyType, number>,
  },
  
  // Notifications
  notifications: {
    enabled: env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true',
    profitThreshold: parseFloat(env.NOTIFY_PROFIT_THRESHOLD),
    lossThreshold: parseFloat(env.NOTIFY_LOSS_THRESHOLD),
    dailyReportTime: env.DAILY_REPORT_TIME,
  },
  
  // Security
  security: {
    jwtSecret: env.JWT_SECRET,
    encryptionKey: env.ENCRYPTION_KEY,
  },
  
  // Features
  features: {
    autoTrading: env.ENABLE_AUTO_TRADING === 'true',
    autoRebalance: env.ENABLE_AUTO_REBALANCE === 'true',
    dryRun: env.DRY_RUN === 'true',
    debug: env.DEBUG === 'true',
  },
};

// ------------------------------------------
// Validation Helpers
// ------------------------------------------

export function validateConfig(): void {
  // Check strategy weights sum to 1
  const totalWeight = Object.values(config.ai.strategyWeights).reduce((a, b) => a + b, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    throw new Error(`Strategy weights must sum to 1.0, got ${totalWeight}`);
  }
  
    // Check required credentials
  if (!config.solana.privateKey && !config.solana.keyPath) {
    throw new Error('Wallet configuration is incomplete. Please check your environment variables and ensure either a private key or key file path is provided.');
  }
  
  console.log('✅ Configuration validated successfully');
}

export default config;
