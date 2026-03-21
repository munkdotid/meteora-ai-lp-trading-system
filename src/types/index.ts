// ==========================================
// TYPE DEFINITIONS
// AI LP Trading System
// ==========================================

// ------------------------------------------
// Core Domain Types
// ------------------------------------------

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface Pool {
  address: string;
  tokenA: Token;
  tokenB: Token;
  currentPrice: number;
  tvl: number;
  volume24h: number;
  feeRate: number; // e.g., 0.0005 = 0.05%
  volatility: number;
  liquidityDistribution: LiquidityDistribution;
  createdAt: Date;
  updatedAt: Date;
}

export interface LiquidityDistribution {
  bins: Bin[];
  activeBinId: number;
}

export interface Bin {
  id: number;
  price: number;
  liquidityX: number;
  liquidityY: number;
}

// ------------------------------------------
// Position Types
// ------------------------------------------

export interface Position {
  id: string;
  poolAddress: string;
  strategy: StrategyType;
  
  // Entry details
  entryPrice: number;
  entryTime: Date;
  investment: {
    sol: number;
    usd: number;
  };
  
  // Range
  range: {
    lower: number;
    upper: number;
  };
  
  // Current state
  currentPrice: number;
  currentValue: {
    usd: number;
  };
  
  // Performance
  pnl: PnL;
  feesEarned: {
    tokenA: number;
    tokenB: number;
    usd: number;
  };
  impermanentLoss: {
    percentage: number;
    usd: number;
  };
  
  // Status
  status: PositionStatus;
  inRange: boolean;
  
  // AI metadata
  aiConfidence: number;
  riskScore: number;
  expectedAPR: number;
  
  // Timestamps
  lastRebalance?: Date;
  exitTime?: Date;
  
  // Transaction signatures
  entryTxSignature: string;
  exitTxSignature?: string;
}

export interface PnL {
  realized: number; // USD
  unrealized: number; // USD
  percentage: number; // Percentage
}

export type PositionStatus = 'active' | 'rebalancing' | 'closing' | 'closed';

export type StrategyType = 'alpha' | 'range' | 'momentum';

// ------------------------------------------
// AI Decision Types
// ------------------------------------------

export interface AIDecision {
  id: string;
  poolAddress: string;
  action: ActionType;
  strategy?: StrategyType;
  confidence: number;
  expectedAPR: number;
  riskScore: number;
  reasoning: string;
  recommendedRange?: {
    lower: number;
    upper: number;
  };
  positionSize?: number; // Percentage of capital
  executed: boolean;
  result?: TradeResult;
  timestamp: Date;
}

export type ActionType = 'enter' | 'exit' | 'rebalance' | 'hold' | 'skip';

export interface TradeResult {
  success: boolean;
  pnl?: number;
  error?: string;
  executionTime?: number;
}

// ------------------------------------------
// Scout Analysis Types
// ------------------------------------------

export interface PoolAnalysis {
  pool: Pool;
  opportunityScore: number;
  metrics: PoolMetrics;
  trend: TrendAnalysis;
  recommendation: 'high' | 'medium' | 'low' | 'avoid';
}

export interface PoolMetrics {
  volumeToTvlRatio: number;
  feeAPR: number;
  priceStability: number;
  liquidityDepth: number;
  ageScore: number;
}

export interface TrendAnalysis {
  volumeTrend: 'up' | 'down' | 'stable';
  priceTrend: 'up' | 'down' | 'sideways';
  volatilityTrend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number; // 0-1
}

// ------------------------------------------
// Risk Management Types
// ------------------------------------------

export interface RiskAssessment {
  overallRisk: RiskLevel;
  riskScore: number; // 0-100
  warnings: RiskWarning[];
  positionSize: number; // Recommended percentage
  circuitBreaker?: CircuitBreakerType;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskWarning {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export type CircuitBreakerType = 
  | 'daily_loss_limit'
  | 'max_drawdown'
  | 'gas_spike'
  | 'tvl_crash'
  | 'volatility_spike'
  | 'api_failure';

export interface RiskLimits {
  maxPositions: number;
  maxPerPool: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  minPoolTVL: number;
  minVolume24h: number;
  maxVolatility: number;
  minPoolAgeHours: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
}

// ------------------------------------------
// Trading Types
// ------------------------------------------

export interface TradeIntent {
  type: 'entry' | 'exit' | 'rebalance';
  poolAddress: string;
  positionId?: string;
  amount?: number;
  strategy?: StrategyType;
  range?: {
    lower: number;
    upper: number;
  };
}

export interface TradeExecution {
  id: string;
  positionId?: string;
  type: 'entry' | 'exit' | 'rebalance';
  actions: TradeAction[];
  status: 'pending' | 'simulating' | 'executing' | 'confirmed' | 'failed';
  gasCost: number;
  totalSlippage: number;
  timestamp: Date;
  error?: string;
}

export interface TradeAction {
  type: 'swap' | 'add_liquidity' | 'remove_liquidity';
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: number;
  amountOut?: number;
  expectedAmountOut?: number;
  slippageBps: number;
  txSignature?: string;
  status: 'pending' | 'sent' | 'confirmed' | 'failed';
}

// ------------------------------------------
// Jupiter Types
// ------------------------------------------

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: number;
  outAmount: number;
  otherAmountThreshold: number;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee?: {
    amount: number;
    feeBps: number;
  };
  priceImpactPct: number;
  routePlan: RoutePlanStep[];
  contextSlot: number;
  timeTaken: number;
}

export interface RoutePlanStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: number;
    outAmount: number;
    feeAmount: number;
    feeMint: string;
  };
  percent: number;
}

// ------------------------------------------
// Meteora DLMM Types
// ------------------------------------------

export interface DLMMPosition {
  address: string;
  poolAddress: string;
  lowerBinId: number;
  upperBinId: number;
  liquidityShares: number;
  tokenXAmount: number;
  tokenYAmount: number;
  totalClaimedFeeX: number;
  totalClaimedFeeY: number;
}

export interface DLMMStrategyParams {
  strategyType: 'spot' | 'bidAsk' | 'curve';
  maxBinId: number;
  minBinId: number;
}

// ------------------------------------------
// Performance Types
// ------------------------------------------

export interface PerformanceMetrics {
  date: Date;
  startingBalance: number;
  endingBalance: number;
  realizedPnL: number;
  unrealizedPnL: number;
  feesEarned: number;
  impermanentLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  aiConfidenceAvg: number;
}

// ------------------------------------------
// Telegram Types
// ------------------------------------------

export interface TelegramCommand {
  command: string;
  description: string;
  handler: (ctx: any) => Promise<void>;
  requireAuth: boolean;
  requireAdmin: boolean;
  require2FA: boolean;
}

export interface NotificationPayload {
  type: 'profit' | 'loss' | 'rebalance' | 'entry' | 'exit' | 'emergency' | 'daily_report';
  title: string;
  message: string;
  data?: any;
  keyboard?: any;
  image?: Buffer;
}

// ------------------------------------------
// System Types
// ------------------------------------------

export interface SystemStatus {
  running: boolean;
  walletAddress: string;
  balance: {
    sol: number;
    usd: number;
  };
  activePositions: number;
  totalPositions: number;
  todayPnL: number;
  totalPnL: number;
  lastUpdate: Date;
  uptime: number;
  ai: {
    mode: StrategyType;
    confidence: number;
    nextScan: number;
  };
}

export interface BotConfig {
  trading: RiskLimits;
  ai: {
    minConfidence: number;
    strategyWeights: Record<StrategyType, number>;
  };
  rebalance: {
    interval: number;
    outOfRangeThreshold: number;
  };
  notifications: {
    enabled: boolean;
    profitThreshold: number;
    lossThreshold: number;
  };
}

// ------------------------------------------
// API Types
// ------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
