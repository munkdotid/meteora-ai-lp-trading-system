# BUSINESS REQUIREMENT DOCUMENT
# AI Liquidity Provider Trading System for Meteora DLMM + Jupiter Aggregator

**Document Version:** 2.0  
**Date:** 2026-03-21  
**Author:** Agen Ari  
**Status:** Final Review  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Business Objectives](#3-business-objectives)
4. [Functional Requirements](#4-functional-requirements)
5. [Multi-Agent AI System](#5-multi-agent-ai-system)
6. [Trading & Execution](#6-trading--execution)
7. [Auto Rebalance System](#7-auto-rebalance-system)
8. [Risk Management](#8-risk-management)
9. [Dashboard & Monitoring](#9-dashboard--monitoring)
10. [Telegram Integration](#10-telegram-integration)
11. [Technical Architecture](#11-technical-architecture)
12. [Security Requirements](#12-security-requirements)
13. [Performance Targets](#13-performance-targets)
14. [Implementation Roadmap](#14-implementation-roadmap)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Project Vision
Build an **Autonomous AI Liquidity Fund System** that operates 24/7 on Meteora DLMM (Dynamic Liquidity Market Maker) protocol integrated with Jupiter Aggregator for optimal swap routing.

### 1.2 Value Proposition
- **Fully automated** liquidity provision with AI-driven decision making
- **Adaptive strategies** that respond to market conditions in real-time
- **Multi-layer risk management** to protect capital
- **Real-time monitoring** via web dashboard and Telegram

### 1.3 Target Users
- DeFi power users seeking automated yield
- Crypto fund managers
- Sophisticated retail investors

---

## 2. SYSTEM OVERVIEW

### 2.1 System Classification

```
Manual LP user      ❌ NOT APPLICABLE
Basic bot           ❌ NOT APPLICABLE
Advanced bot        ✅ ACHIEVED
AI trading system   ✅ ACHIEVED
Mini hedge fund     ✅ TARGET LEVEL
```

### 2.2 Core Value Chain

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SCOUT     │───▶│  ANALYST    │───▶│   RISK MGR  │───▶│  EXECUTOR   │
│  (Scan)     │    │  (Decide)   │    │  (Filter)   │    │  (Execute)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
   Find Pools      Select Strategy    Validate Risk     Execute Trade
   Rank by          Calculate           Check Exposure    Swap via
   Opportunity      Expected Returns    Circuit Breaker   Jupiter
   Score            Set Confidence      Position Limits   Add to Meteora
                                                         Remove Liquidity
```

### 2.3 Technology Stack

| Layer | Technology |
|-------|------------|
| Blockchain | Solana |
| DEX Protocol | Meteora DLMM |
| Aggregator | Jupiter |
| Backend | Node.js / TypeScript |
| Database | PostgreSQL + Redis |
| AI/ML | TensorFlow.js / Custom Models |
| Frontend | React + WebSocket |
| Notifications | Telegram Bot API |
| Hosting | VPS / Cloud |

---

## 3. BUSINESS OBJECTIVES

### 3.1 Primary KPIs

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Daily ROI | 0.3-0.5% | Daily |
| Annual ROI | 300-600% APR | Annual |
| Max Drawdown | < 10% | Monthly |
| Win Rate | > 65% | Per Position |
| Sharpe Ratio | > 1.5 | Portfolio |
| Uptime | 99.5% | 24/7 |

### 3.2 Risk Parameters

| Parameter | Limit | Rationale |
|-----------|-------|-----------|
| Max Positions | 5 concurrent | Diversification |
| Max Per Pool | 20% of capital | Concentration risk |
| Stop Loss | 3% per position | Capital preservation |
| Daily Loss Limit | 5% | Circuit breaker |
| Max Volatility | 50% | Avoid extreme swings |

---

## 4. FUNCTIONAL REQUIREMENTS

### 4.1 Core Trading Engine

#### FR-001: Pool Discovery
**Priority:** P0 - Critical  
**Description:** System must continuously scan all Meteora DLMM pools  
**Requirements:**
- Scan interval: Every 180 seconds (3 minutes)
- Fetch: Volume, TVL, fee rates, price history
- Filter: Min TVL $500K, Min 24h volume $100K
- Age filter: Pool must exist > 24 hours
- Calculate: Volume/TVL ratio, fee APR

#### FR-002: AI Decision Engine
**Priority:** P0 - Critical  
**Description:** Multi-factor scoring for pool selection  
**Input Factors:**
- Volume trend (short & medium term)
- TVL stability
- Volatility (price variance)
- Fee generation rate
- Token correlation matrix
- Market sentiment indicators

**Output:**
- Action: ENTER / EXIT / SKIP / REBALANCE
- Strategy: Alpha / Range / Momentum
- Confidence Score: 0-100%
- Expected APR: Projected annual return

#### FR-003: Position Management
**Priority:** P0 - Critical  
**Description:** Full lifecycle of LP positions  
**Capabilities:**
- Open new positions (swap + add liquidity)
- Monitor active positions
- Close positions (remove liquidity + swap back)
- Track PnL (realized & unrealized)
- Calculate impermanent loss
- Log all transactions

### 4.2 Data Requirements

#### FR-004: Real-time Data Feed
**Priority:** P0 - Critical  
**Sources:**
- Meteora DLMM API (pool data)
- Jupiter API (quotes, swaps)
- Solana RPC (wallet balance, transactions)
- Market data (volume, TVL, volatility)

**Update Frequency:**
- Price data: Every 3-5 seconds
- Pool metrics: Every 180 seconds
- Wallet balance: Every 60 seconds
- PnL calculation: Every 60 seconds

#### FR-005: Historical Data Storage
**Priority:** P1 - High  
**Data to Store:**
- All trades (entry, exit, rebalance)
- Pool snapshots (price, volume, TVL)
- AI predictions vs actual results
- Risk events and responses
- Performance metrics by strategy

**Retention:**
- Raw data: 90 days
- Aggregated metrics: 2 years
- Trade history: Indefinite

---

## 5. MULTI-AGENT AI SYSTEM

### 5.1 Agent Architecture

#### AGENT-001: Scout Agent
```typescript
interface ScoutAgent {
  // Continuously scan for opportunities
  scanInterval: 180; // seconds
  
  // Scoring algorithm
  calculateOpportunityScore(pool: Pool): Score {
    return weightedAverage([
      volumeTrend * 0.25,
      tvlStability * 0.20,
      feeAPR * 0.30,
      volatilityScore * 0.15,
      correlationRisk * 0.10
    ]);
  }
  
  // Filters
  filters: {
    minTVL: 500000,
    minVolume24h: 100000,
    minPoolAgeHours: 24,
    maxVolatility: 0.50
  }
}
```

**Output:** Ranked list of candidate pools with opportunity scores

#### AGENT-002: Analyst Agent (AI Core)
```typescript
interface AnalystAgent {
  // Deep pool analysis
  analyzePool(pool: Pool): Analysis {
    return {
      strategy: determineStrategy(pool), // Alpha | Range | Momentum
      confidence: calculateConfidence(pool),
      expectedAPR: projectReturns(pool),
      riskScore: assessRisk(pool),
      recommendedRange: calculateOptimalRange(pool),
      entryTiming: suggestEntrySchedule(pool)
    };
  }
  
  // Strategy selection
  determineStrategy(pool: Pool): Strategy {
    if (isSmallCap(pool) && hasHighVolume(pool)) {
      return 'Alpha';
    } else if (isSidewaysMarket(pool)) {
      return 'Range';
    } else if (hasStrongTrend(pool)) {
      return 'Momentum';
    }
  }
}
```

**ML Models:**
- Volume prediction (LSTM/Transformer)
- Price trend classification
- Volatility forecasting
- Strategy performance predictor

#### AGENT-003: Risk Manager Agent
```typescript
interface RiskManager {
  // Pre-trade validation
  validateTrade(intent: TradeIntent): Validation {
    return {
      approved: boolean,
      riskLevel: 'Low' | 'Medium' | 'High',
      maxPositionSize: number,
      warnings: string[],
      requiredActions: string[]
    };
  }
  
  // Checks
  checks: {
    exposureCheck: ensureTotalExposureBelowLimit(),
    correlationCheck: avoidCorrelatedPairs(),
    concentrationCheck: maxPercentagePerPool(0.20),
    volatilityCheck: rejectHighVolatilityPools(0.50),
    confidenceThreshold: minAIConfidence(0.75)
  }
  
  // Circuit breakers
  circuitBreakers: {
    dailyLossLimit: 0.05,
    maxDrawdown: 0.10,
    gasSpike: 0.01, // SOL
    tvlDrop: 0.30,
    volatilitySpike: 3.0
  }
}
```

#### AGENT-004: Executor Agent
```typescript
interface ExecutorAgent {
  // Execute trades
  async executeEntry(pool: Pool, amount: number): Promise<Receipt> {
    // 1. Swap SOL to token (Jupiter)
    const swapTx = await jupiter.swap({
      inputMint: SOL,
      outputMint: pool.tokenB,
      amount: amount / 2,
      slippageBps: 50
    });
    
    // 2. Add liquidity (Meteora)
    const lpTx = await meteora.addLiquidity({
      pool: pool.address,
      tokenAAmount: amount / 2,
      tokenBAmount: swappedAmount,
      range: pool.recommendedRange
    });
    
    return { swapTx, lpTx, timestamp: now() };
  }
  
  // MEV protection
  useJitoBundles: true,
  tipAmount: 0.0001 // SOL
}
```

#### AGENT-005: Memory Agent
```typescript
interface MemoryAgent {
  // Store trade results
  logTrade(trade: Trade): void {
    database.trades.insert(trade);
    updateStrategyPerformance(trade.strategy, trade.pnl);
  }
  
  // Evaluate performance
  calculateStrategyROI(strategy: Strategy, timeframe: number): number;
  identifyBestPerformingPools(): Pool[];
  detectStrategyDrift(): Alert[];
  
  // Learning
  updateAIModels(feedback: TradeResult[]): void;
  retrainVolumePredictor(): void;
}
```

---

## 6. TRADING & EXECUTION

### 6.1 Jupiter Aggregator Integration

#### JUP-001: Swap Execution
```typescript
interface JupiterIntegration {
  // Get best route
  async getQuote(params: QuoteParams): Promise<Quote> {
    return jupiter.quoteGet({
      inputMint: params.inputToken,
      outputMint: params.outputToken,
      amount: params.amount,
      slippageBps: params.slippage || 50,
      onlyDirectRoutes: false,
      asLegacyTransaction: false
    });
  }
  
  // Execute swap
  async executeSwap(quote: Quote): Promise<Signature> {
    const swapTx = await jupiter.swapPost({ swapRequest: quote });
    return await connection.sendTransaction(swapTx, [wallet], {
      maxRetries: 3,
      skipPreflight: false
    });
  }
  
  // Slippage control
  defaultSlippageBps: 50, // 0.5%
  maxSlippageBps: 200,     // 2% (hard limit)
  dynamicSlippage: true    // Adjust based on volatility
}
```

### 6.2 Meteora DLMM Integration

#### MET-001: Liquidity Operations
```typescript
interface MeteoraIntegration {
  // Add liquidity
  async addLiquidity(params: AddLiquidityParams): Promise<Signature> {
    const dlmmPool = await DLMM.create(connection, params.poolAddress);
    
    // Calculate bin range
    const bins = await dlmmPool.getBinsAroundActiveBin(
      params.rangeWidth,
      params.rangeWidth
    );
    
    // Create position
    const tx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: wallet.publicKey,
      totalXAmount: params.tokenAAmount,
      totalYAmount: params.tokenBAmount,
      strategy: {
        maxBinId: bins.maxBinId,
        minBinId: bins.minBinId,
        strategyType: params.strategyType // Spot | BidAsk | Curve
      }
    });
    
    return await connection.sendTransaction(tx, [wallet]);
  }
  
  // Remove liquidity
  async removeLiquidity(position: Position): Promise<Signature>;
  
  // Get position info
  async getPositionInfo(positionAddress: string): Promise<PositionInfo>;
  
  // Calculate fees earned
  async calculateFees(position: Position): Promise<{
    tokenAFees: number,
    tokenBFees: number,
    totalValueUSD: number
  }>;
}
```

---

## 7. AUTO REBALANCE SYSTEM

### 7.1 Rebalance Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Out of Range | Price exits position range | Rebalance immediately |
| Profit Target | PnL > 5% | Optional rebalance |
| IL Threshold | IL > 3% | Alert + rebalance |
| Time-based | Every 4 hours | Evaluate & rebalance if needed |
| Volatility Spike | Volatility 2x normal | Expand range |
| Strategy Shift | AI changes recommendation | Rebalance to new strategy |

### 7.2 Rebalance Logic

```typescript
interface RebalanceSystem {
  // Check if rebalance needed
  async checkRebalanceNeeded(position: Position): Promise<RebalanceDecision> {
    const currentPrice = await getCurrentPrice(position.pool);
    const isInRange = currentPrice >= position.range.lower && 
                      currentPrice <= position.range.upper;
    
    if (!isInRange) {
      return { action: 'REBALANCE_IMMEDIATE', reason: 'OUT_OF_RANGE' };
    }
    
    const pnl = await calculatePnL(position);
    if (pnl.realized > 0.05) {
      return { action: 'REBALANCE_OPTIONAL', reason: 'PROFIT_TARGET' };
    }
    
    const volatility = await calculateVolatility(position.pool, 24);
    const newRange = calculateRangeWidth(volatility, position.strategy);
    
    if (newRange > position.currentRange * 1.3) {
      return { action: 'EXPAND_RANGE', reason: 'HIGH_VOLATILITY' };
    }
    
    return { action: 'HOLD', reason: 'NO_ACTION_NEEDED' };
  }
  
  // Execute rebalance
  async rebalance(position: Position): Promise<Receipt> {
    // 1. Remove current liquidity
    await meteora.removeLiquidity(position);
    
    // 2. Swap to target ratio (if needed)
    const currentRatio = await getWalletRatio(position.tokens);
    const targetRatio = calculateTargetRatio(position.strategy);
    
    if (Math.abs(currentRatio - targetRatio) > 0.05) {
      await jupiter.swap({
        inputToken: currentRatio > targetRatio ? position.tokenA : position.tokenB,
        amount: calculateSwapAmount(currentRatio, targetRatio)
      });
    }
    
    // 3. Calculate new range
    const newRange = await calculateOptimalRange(position.pool, position.strategy);
    
    // 4. Add liquidity with new range
    await meteora.addLiquidity({
      pool: position.pool,
      range: newRange,
      strategy: position.strategy
    });
    
    // 5. Log and notify
    await logRebalance(position, newRange);
    await telegram.notifyRebalance(position, newRange);
    
    return receipt;
  }
}
```

### 7.3 Range Width Strategies

| Mode | Width | Fee Potential | IL Risk | Best For |
|------|-------|---------------|---------|----------|
| Narrow | ±5% | Very High | High | Low volatility, trending |
| Medium | ±15% | High | Medium | Normal market |
| Wide | ±30% | Medium | Low | High volatility, uncertain |

---

## 8. RISK MANAGEMENT

### 8.1 Risk Framework

#### RISK-001: Position-Level Limits
```typescript
const positionLimits = {
  maxSize: 0.20,              // 20% of total capital
  minSize: 0.01,              // 1% minimum
  maxILBeforeExit: 0.03,      // 3% impermanent loss
  maxSlippage: 0.02,          // 2% slippage limit
  maxGasCost: 0.01            // 0.01 SOL per tx
};
```

#### RISK-002: Portfolio-Level Limits
```typescript
const portfolioLimits = {
  maxPositions: 5,
  maxTotalExposure: 0.90,     // 90% of capital deployed
  maxCorrelatedExposure: 0.40, // 40% in correlated assets
  minCashReserve: 0.10,        // 10% cash reserve
  dailyLossLimit: 0.05,        // 5% daily stop
  maxDrawdown: 0.10            // 10% max drawdown
};
```

#### RISK-003: Market Conditions
```typescript
const marketFilters = {
  minPoolTVL: 500000,          // $500K minimum
  minVolume24h: 100000,        // $100K daily volume
  maxVolatility: 0.50,          // 50% max volatility
  minPoolAge: 24,              // 24 hours minimum age
  blacklistTokens: ['scam_token', 'honeypot'], // Auto-filter
  requireVerified: true         // Only verified tokens
};
```

### 8.2 Circuit Breakers

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Daily Loss | > 5% | Stop all new entries |
| Max Drawdown | > 10% | Emergency exit all positions |
| Gas Spike | > 0.01 SOL | Pause trading until normal |
| TVL Crash | > 30% drop in 1 hour | Exit pool immediately |
| Volatility Spike | > 3x normal | Reduce position sizes 50% |
| API Failure | > 3 consecutive | Pause and alert |

### 8.3 Graduated Position Sizing

```typescript
function calculatePositionSize(
  confidence: number,      // AI confidence 0-1
  riskScore: number,       // Risk rating 0-1
  poolAge: number,         // Hours since creation
  volatility: number       // Current volatility
): number {
  
  const baseSize = 0.25;   // 25% max
  
  // Confidence multiplier
  const confidenceMult = confidence; // 0.8 conf = 80% of base
  
  // Risk multiplier
  const riskMult = 1 - riskScore;    // Lower risk = bigger size
  
  // Age multiplier
  const ageMult = poolAge > 168 ? 1.0 : // > 7 days = full
                  poolAge > 72 ? 0.8 :  // > 3 days = 80%
                  poolAge > 24 ? 0.5 :  // > 1 day = 50%
                  0;                    // < 1 day = skip
  
  // Volatility adjustment
  const volMult = volatility > 0.30 ? 0.5 :
                  volatility > 0.20 ? 0.8 :
                  1.0;
  
  return baseSize * confidenceMult * riskMult * ageMult * volMult;
}
```

---

## 9. DASHBOARD & MONITORING

### 9.1 Web Dashboard Features

#### DASH-001: Real-time Overview
- Wallet balance (SOL + USD value)
- Total PnL (realized + unrealized)
- Active positions count
- Bot status (running/stopped)
- AI mode and confidence
- Next scheduled actions

#### DASH-002: Position Monitor
- List of all active positions
- Real-time PnL per position
- In-range status (visual indicator)
- Fee accumulation rate
- IL tracking
- Recommended actions

#### DASH-003: Performance Analytics
- Daily/weekly/monthly PnL charts
- Strategy performance comparison
- Win rate by strategy
- Average hold time
- Fee vs IL breakdown
- Sharpe ratio over time

#### DASH-004: AI Insights
- Current strategy distribution
- AI confidence trends
- Prediction accuracy
- Best performing predictions
- Model performance metrics

#### DASH-005: Risk Dashboard
- Current exposure breakdown
- Correlation heatmap
- Risk score trends
- Circuit breaker status
- Alert history

### 9.2 WebSocket Events

```typescript
// Server to Client events
interface WebSocketEvents {
  'price_update': { pair: string, price: number, timestamp: number };
  'position_update': { positionId: string, pnl: PnL, inRange: boolean };
  'balance_update': { sol: number, usd: number };
  'ai_decision': { pool: string, action: Action, confidence: number };
  'trade_executed': { type: 'entry' | 'exit' | 'rebalance', receipt: Receipt };
  'risk_alert': { level: 'warning' | 'critical', message: string };
  'system_status': { status: Status, uptime: number };
}

// Update frequency
const frequencies = {
  price: 3000,        // 3 seconds
  position: 30000,    // 30 seconds
  balance: 60000,     // 1 minute
  ai_decision: 180000 // 3 minutes
};
```

---

## 10. TELEGRAM INTEGRATION

### 10.1 Bot Commands

| Command | Description | Security Level |
|---------|-------------|----------------|
| `/start` | Activate bot | Authorized users only |
| `/stop` | Pause bot (confirm required) | Authorized users only |
| `/status` | Full system status | Authorized users only |
| `/positions` | Detail all positions | Authorized users only |
| `/pnl` | Profit/loss report | Authorized users only |
| `/pause` | Pause (keep positions) | Authorized users only |
| `/rebalance` | Force rebalance all | Authorized users only |
| `/emergency` | Emergency stop (no confirm) | 2FA required |
| `/settings` | View current settings | Authorized users only |
| `/set` | Modify settings | Admin only |
| `/addliquidity` | Manual entry | Admin only |
| `/withdraw` | Emergency withdrawal | 2FA required |

### 10.2 Automatic Notifications

#### NOTIF-001: Profit Alerts
```
💰 PROFIT TARGET REACHED

🏊 {pair}
🎯 PnL: +{percentage}% (+${usd})
💸 Fees: ${fees}

Rebalancing...
```

#### NOTIF-002: Loss Warnings
```
⚠️ LOSS WARNING

🏊 {pair}
🔴 PnL: {percentage}% (${usd})
⚠️ IL: {il}%

AI Recommendation: {recommendation}

[🚪 Exit] [🔄 Rebalance] [📊 Hold]
```

#### NOTIF-003: Rebalance Notifications
```
♻️ REBALANCE EXECUTED

🏊 {pair}
🎯 Reason: {reason}

📊 Old Range: {oldLower} - {oldUpper}
📊 New Range: {newLower} - {newUpper}
💸 Cost: ${cost}
```

#### NOTIF-004: Entry Notifications
```
🚀 NEW POSITION OPENED

🏊 {pair}
💰 Investment: ${usd}
📊 Range: {lower} - {upper}
🤖 Strategy: {strategy}
⭐ AI Confidence: {confidence}%

Expected APR: {apr}%
Risk Score: {risk}/100
```

#### NOTIF-005: Emergency Alerts
```
🚨 EMERGENCY ALERT

⚠️ {reason}

Bot status: PAUSED
All positions under review.

Check /status for details
```

#### NOTIF-006: Daily Report
```
📊 DAILY REPORT - {date}

💰 Start: ${startBalance}
💰 End: ${endBalance}
📈 Net: {change}% (${changeUsd})

🏊 Positions: {opened} opened, {closed} closed
💸 Fees: ${fees}
⚠️ IL: ${il}

🤖 AI: {trades} trades, {winRate}% win rate
```

### 10.3 Security Features

```typescript
interface TelegramSecurity {
  // Whitelist authorized users
  authorizedUsers: string[]; // Telegram user IDs
  
  // IP whitelist for webhook
  allowedIPs: string[];
  
  // 2FA for critical commands
  require2FA: ['emergency', 'withdraw', 'stop'];
  
  // Rate limiting
  maxCommandsPerMinute: 10;
  cooldownBetweenCommands: 3000; // ms
  
  // Audit logging
  logAllCommands: true;
  logAllActions: true;
  
  // Secret token validation
  webhookSecret: string;
}
```

### 10.4 Interactive Features

- Inline keyboards for quick actions (Exit/Rebalance/Hold)
- Real-time status updates (edit existing messages)
- Chart images for PnL visualization
- Confirmation dialogs for destructive actions
- 2FA code verification flow

---

## 11. TECHNICAL ARCHITECTURE

### 11.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
├──────────────┬──────────────┬───────────────────────────────┤
│   Web        │   Telegram   │         Mobile (future)        │
│  Dashboard   │    Bot       │                                │
└──────────────┴──────────────┴───────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                    API GATEWAY                             │
│  - Rate limiting  - Authentication  - Request routing      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    CORE SERVICES                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Scout   │ │ Analyst  │ │ Risk Mgr │ │ Executor │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Memory  │ │ Rebalance│ │  Wallet  │ │  Config  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│                   DATA LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PostgreSQL   │  │    Redis     │  │    SQLite    │     │
│  │  (Primary)   │  │   (Cache)    │  │  (Local)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│              EXTERNAL INTEGRATIONS                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Meteora    │  │   Jupiter    │  │   Solana     │     │
│  │    DLMM      │  │  Aggregator  │  │     RPC      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Telegram   │  │  Price Feed  │                        │
│  │     API      │  │    APIs      │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Database Schema

```sql
-- Positions table
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  pool_address VARCHAR(44) NOT NULL,
  token_a VARCHAR(44) NOT NULL,
  token_b VARCHAR(44) NOT NULL,
  strategy VARCHAR(20) NOT NULL,
  entry_price DECIMAL(20, 10) NOT NULL,
  current_price DECIMAL(20, 10),
  range_lower DECIMAL(20, 10) NOT NULL,
  range_upper DECIMAL(20, 10) NOT NULL,
  investment_sol DECIMAL(20, 10) NOT NULL,
  investment_usd DECIMAL(20, 2) NOT NULL,
  current_value_usd DECIMAL(20, 2),
  pnl_usd DECIMAL(20, 2),
  pnl_percentage DECIMAL(8, 4),
  fees_earned_usd DECIMAL(20, 2),
  impermanent_loss DECIMAL(8, 4),
  ai_confidence DECIMAL(5, 4),
  risk_score INTEGER,
  status VARCHAR(20) NOT NULL, -- active, closed, rebalancing
  entry_time TIMESTAMP NOT NULL,
  last_rebalance TIMESTAMP,
  exit_time TIMESTAMP,
  tx_signature VARCHAR(88),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trades table
CREATE TABLE trades (
  id UUID PRIMARY KEY,
  position_id UUID REFERENCES positions(id),
  type VARCHAR(20) NOT NULL, -- entry, exit, rebalance
  action VARCHAR(20) NOT NULL, -- swap, add_liquidity, remove_liquidity
  token_in VARCHAR(44),
  token_out VARCHAR(44),
  amount_in DECIMAL(20, 10),
  amount_out DECIMAL(20, 10),
  slippage DECIMAL(8, 4),
  gas_cost_sol DECIMAL(20, 10),
  tx_signature VARCHAR(88) NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  timestamp TIMESTAMP NOT NULL
);

-- Pool snapshots
CREATE TABLE pool_snapshots (
  id UUID PRIMARY KEY,
  pool_address VARCHAR(44) NOT NULL,
  price DECIMAL(20, 10) NOT NULL,
  tvl DECIMAL(20, 2) NOT NULL,
  volume_24h DECIMAL(20, 2) NOT NULL,
  fee_rate DECIMAL(8, 6) NOT NULL,
  volatility DECIMAL(8, 6),
  opportunity_score DECIMAL(5, 4),
  timestamp TIMESTAMP NOT NULL
);

-- AI decisions
CREATE TABLE ai_decisions (
  id UUID PRIMARY KEY,
  pool_address VARCHAR(44) NOT NULL,
  action VARCHAR(20) NOT NULL,
  strategy VARCHAR(20),
  confidence DECIMAL(5, 4) NOT NULL,
  expected_apr DECIMAL(8, 4),
  risk_score INTEGER,
  reasoning TEXT,
  executed BOOLEAN DEFAULT FALSE,
  result_pnl DECIMAL(20, 2),
  timestamp TIMESTAMP NOT NULL
);

-- Performance metrics
CREATE TABLE performance (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  starting_balance DECIMAL(20, 2) NOT NULL,
  ending_balance DECIMAL(20, 2) NOT NULL,
  realized_pnl DECIMAL(20, 2),
  unrealized_pnl DECIMAL(20, 2),
  fees_earned DECIMAL(20, 2),
  impermanent_loss DECIMAL(20, 2),
  total_trades INTEGER,
  winning_trades INTEGER,
  ai_confidence_avg DECIMAL(5, 4),
  sharpe_ratio DECIMAL(8, 4),
  max_drawdown DECIMAL(8, 4)
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### 11.3 Technology Stack Detail

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 20.x LTS |
| Language | TypeScript | 5.x |
| Framework | Fastify | 4.x |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 15.x |
| Cache | Redis | 7.x |
| WebSocket | Socket.io | 4.x |
| AI/ML | TensorFlow.js | 4.x |
| Blockchain | @solana/web3.js | 1.x |
| Meteora | @meteora-ag/dlmm | Latest |
| Jupiter | @jup-ag/core | 4.x |
| Telegram | Telegraf | 4.x |
| Testing | Jest | 29.x |
| Deployment | Docker + PM2 | Latest |

### 11.4 Deployment Architecture

```
┌─────────────────────────────────────────────┐
│              VPS / CLOUD                     │
│  ┌─────────────────────────────────────────┐  │
│  │           Docker Compose               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐    │  │
│  │  │   App   │ │   DB    │ │  Redis  │    │  │
│  │  │Container│ │Container│ │Container│    │  │
│  │  └─────────┘ └─────────┘ └─────────┘    │  │
│  │  ┌─────────┐ ┌─────────┐                │  │
│  │  │Telegram │ │ Nginx   │                │  │
│  │  │ Webhook │ │Reverse  │                │  │
│  │  │Handler  │ │ Proxy   │                │  │
│  │  └─────────┘ └─────────┘                │  │
│  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                      │
              ┌───────┴───────┐
              ▼               ▼
        ┌─────────┐      ┌─────────┐
        │Solana   │      │Telegram │
        │Network  │      │   API   │
        └─────────┘      └─────────┘
```

---

## 12. SECURITY REQUIREMENTS

### 12.1 Wallet Security

| Layer | Implementation |
|-------|---------------|
| Key Storage | AWS KMS / HashiCorp Vault |
| Encryption | AES-256-GCM |
| Access | Never log private keys |
| Backup | Shamir's Secret Sharing (3 of 5) |
| Rotation | Monthly key rotation |

### 12.2 API Security

```typescript
const securityConfig = {
  // Authentication
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: '24h',
  
  // Rate limiting
  rateLimits: {
    public: { max: 30, window: 60000 },    // 30/min
    authenticated: { max: 100, window: 60000 }, // 100/min
    trading: { max: 10, window: 60000 }    // 10/min
  },
  
  // CORS
  allowedOrigins: ['https://yourdomain.com'],
  
  // Headers
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000'
  },
  
  // Input validation
  validateAllInputs: true,
  sanitizeOutputs: true
};
```

### 12.3 Transaction Security

```typescript
const txSecurity = {
  // Slippage protection
  maxSlippageBps: 200, // 2%
  
  // Gas protection
  maxGasPrice: 1000, // lamports
  dynamicGasAdjustment: true,
  
  // Simulation
  simulateBeforeExecution: true,
  
  // MEV protection
  useJitoBundles: true,
  jitoTip: 0.0001, // SOL
  
  // Confirmation
  minConfirmations: 1,
  maxConfirmationTime: 60000, // ms
  
  // Retry logic
  maxRetries: 3,
  retryDelay: 1000, // ms
  
  // Revert protection
  requireSuccessConfirmation: true
};
```

---

## 13. PERFORMANCE TARGETS

### 13.1 Trading Performance

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| Daily ROI | 0.3-0.5% | 0.8% |
| Monthly ROI | 10-15% | 25% |
| Annual ROI | 300-600% APR | 1000% |
| Win Rate | > 65% | > 75% |
| Profit Factor | > 1.5 | > 2.0 |
| Sharpe Ratio | > 1.5 | > 2.5 |
| Max Drawdown | < 10% | < 5% |
| Recovery Time | < 3 days | < 1 day |

### 13.2 System Performance

| Metric | Target |
|--------|--------|
| API Response Time | < 200ms (p95) |
| WebSocket Latency | < 100ms |
| Trade Execution | < 3 seconds |
| Uptime | 99.5% |
| Database Query | < 50ms (p95) |
| Concurrent Users | 10 |
| Memory Usage | < 2GB |
| CPU Usage | < 50% average |

---

## 14. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Week 1-2)
**Goal:** Basic working bot
- [ ] Project setup & dependencies
- [ ] Wallet integration
- [ ] Meteora DLMM connection
- [ ] Jupiter swap integration
- [ ] Simple LP entry/exit
- [ ] Basic position tracking
- [ ] Console logging

**Deliverable:** Manual test trades

### Phase 2: Core AI (Week 3-4)
**Goal:** Decision engine
- [ ] Scout agent implementation
- [ ] Basic scoring algorithm
- [ ] Analyst agent (rule-based)
- [ ] Position sizing logic
- [ ] Database setup
- [ ] Trade history logging

**Deliverable:** Automated pool selection

### Phase 3: Risk & Rebalance (Week 5-6)
**Goal:** Risk management + auto rebalance
- [ ] Risk manager agent
- [ ] Circuit breakers
- [ ] Auto rebalance logic
- [ ] Range adjustment
- [ ] IL calculation
- [ ] Kill switch

**Deliverable:** Self-managing system

### Phase 4: Dashboard (Week 7-8)
**Goal:** Real-time monitoring
- [ ] Web dashboard frontend
- [ ] WebSocket integration
- [ ] PnL calculations
- [ ] Performance charts
- [ ] Position visualization

**Deliverable:** Live monitoring interface

### Phase 5: Telegram (Week 9)
**Goal:** Mobile control
- [ ] Telegram bot setup
- [ ] Command handlers
- [ ] Notification system
- [ ] Interactive keyboards
- [ ] Security layer (2FA)

**Deliverable:** Full mobile control

### Phase 6: Optimization (Week 10-12)
**Goal:** Production ready
- [ ] ML model training
- [ ] Strategy optimization
- [ ] Multi-wallet support
- [ ] Advanced analytics
- [ ] Stress testing
- [ ] Security audit
- [ ] Documentation

**Deliverable:** Production deployment

---

## APPENDIX

### A. Environment Variables

```bash
# Blockchain
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WALLET_PRIVATE_KEY=encrypted_key

# APIs
JUPITER_API_KEY=your_key
METEORA_API_ENDPOINT=https://dlmm-api.meteora.ag

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/meteora_bot
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook
TELEGRAM_WEBHOOK_SECRET=random_secret
AUTHORIZED_USERS=123456789,987654321

# Security
JWT_SECRET=random_string
ENCRYPTION_KEY=32_byte_key
VAULT_ADDR=https://vault.example.com

# Bot Config
MAX_POSITIONS=5
MAX_PER_POOL=0.20
UPDATE_INTERVAL=180000
RISK_LEVEL=medium
```

### B. Glossary

| Term | Definition |
|------|------------|
| **DLMM** | Dynamic Liquidity Market Maker - Meteora's concentrated liquidity protocol |
| **LP** | Liquidity Provider - Someone who deposits tokens to earn fees |
| **IL** | Impermanent Loss - Loss due to price divergence between paired assets |
| **TVL** | Total Value Locked - Total assets in a pool |
| **APR** | Annual Percentage Rate - Yearly return rate |
| **PnL** | Profit and Loss - Net gain or loss |
| **Rebalance** | Adjusting position range to stay in effective range |
| **Slippage** | Difference between expected and actual execution price |
| **MEV** | Maximal Extractable Value - Profitable reordering of transactions |
| **Jito** | MEV protection service on Solana |

### C. Success Criteria

The system will be considered successful when:

1. ✅ Bot runs 24/7 with 99.5% uptime
2. ✅ Achieves target daily ROI (0.3-0.5%)
3. ✅ Maintains max drawdown < 10%
4. ✅ Successfully rebalances automatically
5. ✅ All notifications delivered to Telegram
6. ✅ Zero security incidents
7. ✅ Complete audit trail of all trades

---

**Document Status:** FINAL  
**Review Date:** 2026-03-21  
**Next Review:** Upon implementation completion

---

*This document serves as the authoritative specification for the AI LP Trading System. All implementation decisions should reference this BRD.*
