# INTEGRATION GUIDE
# Applying Gap Fix v2.0.0 to GitHub Repository

**Date:** 2026-03-22  
**Applies to:** munkdotid/meteora-ai-lp-trading-system  

---

## Quick Summary

7 new files close the 4 critical gaps from the BRD review:

```
src/agents/MemoryAgent.ts           ← Full feedback loop (was skeleton)
src/services/PerformanceTracker.ts  ← Live KPI tracking (was missing)
src/services/RebalanceEngine.ts     ← Standalone service (was embedded)
src/api/WebSocketManager.ts         ← All 7 WS events (was stub)
src/api/dashboardRoutes.ts          ← All 5 dashboard routes (was missing)
src/api/PrometheusMetrics.ts        ← /metrics endpoint (was missing)
src/telegram/BotManager.ts          ← All 12 commands + 2FA (was partial)
```

---

## Step-by-Step Integration

### 1. Create new files in your repo

For each file in this fix package, create it in the matching path in your repo.

The files are self-contained with inline type definitions where needed,
so they drop in without requiring changes to existing files first.

### 2. Install new npm dependencies

```bash
cd C:\meteora_bot
npm install telegraf socket.io
npm install --save-dev @types/socket.io
```

> Note: `telegraf` replaces the existing partial Telegram implementation.
> If you already have `telegraf` in package.json, skip.

### 3. Update .env

Add these variables to your `.env` (copy from `.env.example` if needed):

```bash
# Web Dashboard WebSocket origin
DASHBOARD_URL=http://localhost:3001

# Admin users (can use /set command)
# Add your Telegram user ID here
ADMIN_USERS=YOUR_TELEGRAM_USER_ID
```

### 4. Update TradingEngine.ts

Add these integration points to your existing `src/services/TradingEngine.ts`:

#### 4a. Import new classes at the top:
```typescript
import { MemoryAgent } from '../agents/MemoryAgent';
import { PerformanceTracker } from './PerformanceTracker';
import { RebalanceEngine } from './RebalanceEngine';
```

#### 4b. Add as class properties:
```typescript
private memoryAgent: MemoryAgent;
private performanceTracker: PerformanceTracker;
private rebalanceEngine: RebalanceEngine;
```

#### 4c. Initialize in the `initialize()` method:
```typescript
// After prisma and redis are ready:
this.memoryAgent = new MemoryAgent(this.prisma);
await this.memoryAgent.initialize();

this.performanceTracker = new PerformanceTracker(this.prisma);
await this.performanceTracker.initialize(startingBalanceUsd);

this.rebalanceEngine = new RebalanceEngine({
  getCurrentPrice: (addr) => this.meteoraService.getCurrentPrice(addr),
  getVolatility: (addr, h) => this.meteoraService.getVolatility(addr, h),
  executeRebalance: async (pos, range) => {
    await this.executeRebalanceInternal(pos, range);
    return { cost: 0.001 }; // approximate SOL cost
  },
  notifyRebalance: (receipt) => this.botManager.notifyRebalance(
    receipt.positionId,
    pos.pair,
    receipt.reason,
    receipt.oldRange,
    receipt.newRange,
    receipt.cost
  ),
  logRebalance: (receipt) => this.databaseService.logRebalance(receipt),
});
this.rebalanceEngine.start();
```

#### 4d. After every position close, add:
```typescript
// At the end of exitPosition() or closePosition():
await this.memoryAgent.logTrade({
  id: trade.id,
  positionId: position.id,
  strategy: position.strategy as StrategyType,
  pnl: pnlUsd,
  pnlPercentage: pnlPct,
  feesEarned: feesUsd,
  impermanentLoss: ilPct,
  holdTimeHours: holdHours,
  poolAddress: position.poolAddress,
  entryConfidence: position.aiConfidence,
  exitReason: reason,
  timestamp: new Date(),
});

this.performanceTracker.recordTrade(pnlUsd, pnlPct);
```

#### 4e. Schedule daily close (add to initialize() or a cron):
```typescript
// Daily at 23:59
const scheduleDailyClose = () => {
  const now = new Date();
  const next = new Date();
  next.setHours(23, 59, 30, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(async () => {
    await this.performanceTracker.recordDailyClose();
    scheduleDailyClose();
  }, next.getTime() - now.getTime());
};
scheduleDailyClose();
```

### 5. Update index.ts (main entry point)

Add WebSocket and Bot initialization:

```typescript
import { WebSocketManager } from './api/WebSocketManager';
import { BotManager } from './telegram/BotManager';
import { registerDashboardRoutes } from './api/dashboardRoutes';
import { PrometheusMetrics } from './api/PrometheusMetrics';

// After Fastify/HTTP server is created:
const wsManager = new WebSocketManager();
wsManager.initialize(httpServer); // pass your HTTP server instance
wsManager.registerDataProviders({
  getPrices: () => meteoraService.getCurrentPrices(),
  getPositions: () => positionManager.getActivePositionsForWS(),
  getBalance: () => walletService.getBalanceEvent(),
  getSystemStatus: () => tradingEngine.getSystemStatusEvent(),
});
wsManager.startBroadcasting();

// Register REST routes
await registerDashboardRoutes(fastify, {
  getSystemStatus: () => tradingEngine.getSystemStatus(),
  getPositions: () => positionManager.getActivePositions(),
  // ... wire all other deps
});

// Prometheus metrics
const metrics = new PrometheusMetrics();

// Start Telegram bot
const botManager = new BotManager(config.telegram.botToken, {
  getStatus: () => tradingEngine.getSystemStatus(),
  getPositions: () => positionManager.getPositionSummaries(),
  getPnL: () => performanceTracker.getPnLReport(),
  startBot: () => tradingEngine.start(),
  stopBot: (keep) => tradingEngine.stop(keep),
  rebalanceAll: () => tradingEngine.rebalanceAll(),
  rebalancePosition: (id) => tradingEngine.rebalancePosition(id),
  exitPosition: (id) => tradingEngine.exitPosition(id),
  emergencyStop: () => tradingEngine.emergencyStop(),
  getSettings: () => config.getPublicSettings(),
  updateSetting: (k, v) => config.update(k, v),
  getDailyReport: () => memoryAgent.getDailyReport(),
});
await botManager.initialize();
```

### 6. Run in DRY_RUN mode to test

```bash
DRY_RUN=true npm run dev
```

**Expected log output:**
```
[MemoryAgent] Ready. Strategies loaded: 3
[PerformanceTracker] Initialized. Starting balance: 1000
[RebalanceEngine] Started. Check interval: 180s
[WebSocketManager] Initialized
[WebSocketManager] Broadcasting started
[BotManager] Telegram bot launched
```

**Test WebSocket from browser console:**
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

**Test Telegram:**
```
/status      → should return system metrics
/positions   → should return empty list (no positions yet)
/pnl         → should return zero report
```

### 7. Commit and push to GitHub

```bash
git add src/agents/MemoryAgent.ts
git add src/services/PerformanceTracker.ts
git add src/services/RebalanceEngine.ts
git add src/api/WebSocketManager.ts
git add src/api/dashboardRoutes.ts
git add src/api/PrometheusMetrics.ts
git add src/telegram/BotManager.ts
git add CHANGELOG.md
git add INTEGRATION_GUIDE.md

git commit -m "feat: Gap fix v2.0.0 — MemoryAgent, PerformanceTracker, RebalanceEngine, WebSocket, Dashboard API, Telegram BotManager"

git push origin main
```

---

## File Sizes (approximate)

| File | Lines | Size |
|------|-------|------|
| MemoryAgent.ts | ~310 | ~12 KB |
| PerformanceTracker.ts | ~160 | ~6 KB |
| RebalanceEngine.ts | ~200 | ~8 KB |
| WebSocketManager.ts | ~180 | ~7 KB |
| dashboardRoutes.ts | ~130 | ~5 KB |
| PrometheusMetrics.ts | ~80 | ~3 KB |
| BotManager.ts | ~340 | ~13 KB |
| CHANGELOG.md | ~300 | ~12 KB |
| INTEGRATION_GUIDE.md | ~200 | ~8 KB |
| **Total new** | **~1,900** | **~74 KB** |

---

## Verification Checklist

After deployment:

- [ ] `[MemoryAgent] Ready` appears in logs
- [ ] `[PerformanceTracker] Initialized` appears in logs
- [ ] `[RebalanceEngine] Started` appears in logs  
- [ ] `[WebSocketManager] Broadcasting started` appears in logs
- [ ] `[BotManager] Telegram bot launched` appears in logs
- [ ] `GET /health` returns `{ status: "healthy" }`
- [ ] `GET /metrics` returns Prometheus text format
- [ ] Telegram `/status` responds with system metrics
- [ ] Telegram `/emergency` triggers 2FA code flow
- [ ] WebSocket connects and receives `system_status` event

---

*Integration Guide v2.0.0*  
*For: munkdotid/meteora-ai-lp-trading-system*
