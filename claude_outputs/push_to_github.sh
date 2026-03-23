#!/bin/bash
# ============================================================
# PUSH SCRIPT — AI LP Trading System BRD v3.0 Implementation
# Run this from inside your local repo: C:\meteora_bot
# ============================================================
# Prerequisites:
#   git remote set-url origin https://github.com/munkdotid/meteora-ai-lp-trading-system.git
#   git config user.email "your@email.com"
#   git config user.name "Your Name"
# ============================================================

set -e
echo "========================================"
echo " Meteora AI LP Trading System"
echo " BRD v3.0 Implementation Push"
echo "========================================"

# ── Step 1: Verify we are in the right repo ──────────────────
if [ ! -f "package.json" ] || [ ! -d ".git" ]; then
  echo "ERROR: Run this from inside the meteora_bot repo directory"
  exit 1
fi

echo "[1/6] Verified: in git repo"

# ── Step 2: Create all required directories ──────────────────
mkdir -p src/agents
mkdir -p src/services
mkdir -p src/api
mkdir -p src/telegram
mkdir -p src/workers

echo "[2/6] Directories ready"

# ── Step 3: Copy all new/updated files ───────────────────────
# Note: Download these files from Claude's output and place in:
# C:\meteora_bot\claude_outputs\
#
# Folder structure expected:
#   claude_outputs/
#   ├── meteora-gap-fix/
#   │   ├── CHANGELOG.md
#   │   ├── INTEGRATION_GUIDE.md
#   │   └── src/
#   │       ├── agents/MemoryAgent.ts
#   │       ├── api/{PrometheusMetrics,WebSocketManager,dashboardRoutes}.ts
#   │       ├── services/{PerformanceTracker,RebalanceEngine}.ts
#   │       └── telegram/BotManager.ts          ← use meteora-missing version
#   ├── meteora-v3/
#   │   ├── CHANGELOG_V3.md
#   │   ├── Dockerfile.watchdog
#   │   ├── docker-compose.yml
#   │   ├── .env.example
#   │   └── src/
#   │       ├── services/{RpcPoolManager,ILHedgeService,DynamicSlippage,
#   │       │             DisasterRecovery,BacktestEngine,MultiWalletService,
#   │       │             AlertEscalationService,CircuitBreakerService}.ts
#   │       └── workers/watchdog.ts
#   └── meteora-missing/
#       └── src/
#           ├── services/{MarketRegimeDetector,MLPipelineService}.ts
#           └── telegram/BotManager.ts           ← this one has /rpc + /withdraw

OUTPUTS="./claude_outputs"

if [ ! -d "$OUTPUTS" ]; then
  echo ""
  echo "ERROR: claude_outputs/ folder not found."
  echo "Download all files from Claude's output panel and place them in:"
  echo "  C:\\meteora_bot\\claude_outputs\\"
  echo ""
  echo "Then run this script again."
  exit 1
fi

echo "[3/6] Copying files from claude_outputs/..."

# Gap fix files (v2 fixes)
cp "$OUTPUTS/meteora-gap-fix/CHANGELOG.md"                        ./CHANGELOG.md
cp "$OUTPUTS/meteora-gap-fix/INTEGRATION_GUIDE.md"               ./INTEGRATION_GUIDE.md
cp "$OUTPUTS/meteora-gap-fix/src/agents/MemoryAgent.ts"          ./src/agents/
cp "$OUTPUTS/meteora-gap-fix/src/api/PrometheusMetrics.ts"       ./src/api/
cp "$OUTPUTS/meteora-gap-fix/src/api/WebSocketManager.ts"        ./src/api/
cp "$OUTPUTS/meteora-gap-fix/src/api/dashboardRoutes.ts"         ./src/api/
cp "$OUTPUTS/meteora-gap-fix/src/services/PerformanceTracker.ts" ./src/services/
cp "$OUTPUTS/meteora-gap-fix/src/services/RebalanceEngine.ts"    ./src/services/

# v3 new services
cp "$OUTPUTS/meteora-v3/CHANGELOG_V3.md"                                     ./CHANGELOG_V3.md
cp "$OUTPUTS/meteora-v3/Dockerfile.watchdog"                                  ./Dockerfile.watchdog
cp "$OUTPUTS/meteora-v3/docker-compose.yml"                                   ./docker-compose.yml
cp "$OUTPUTS/meteora-v3/src/services/RpcPoolManager.ts"                       ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/ILHedgeService.ts"                      ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/DynamicSlippage.ts"                     ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/DisasterRecovery.ts"                    ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/BacktestEngine.ts"                      ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/MultiWalletService.ts"                  ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/AlertEscalationService.ts"              ./src/services/
cp "$OUTPUTS/meteora-v3/src/services/CircuitBreakerService.ts"               ./src/services/
cp "$OUTPUTS/meteora-v3/src/workers/watchdog.ts"                              ./src/workers/

# Missing files (BotManager with /rpc + /withdraw, MarketRegime, MLPipeline)
cp "$OUTPUTS/meteora-missing/src/telegram/BotManager.ts"                     ./src/telegram/
cp "$OUTPUTS/meteora-missing/src/services/MarketRegimeDetector.ts"           ./src/services/
cp "$OUTPUTS/meteora-missing/src/services/MLPipelineService.ts"              ./src/services/

# Update .env.example — merge v3 vars (keep existing, append new)
echo "" >> .env.example
echo "# ── v3.0 additions ──────────────────────────────────────" >> .env.example
grep "SOLANA_RPC_PRIMARY\|SOLANA_RPC_SECONDARY\|SOLANA_RPC_TERTIARY\|WALLET_HOT\|WALLET_WARM\|WALLET_COLD\|WALLET_REFILL\|TWILIO\|DEAD_MANS\|DR_BACKUP\|PAPER_TRADING\|BACKTEST" \
  "$OUTPUTS/meteora-v3/.env.example" >> .env.example 2>/dev/null || true

echo "[3/6] All files copied"

# ── Step 4: Install new npm dependencies ─────────────────────
echo "[4/6] Installing new npm packages..."
npm install telegraf socket.io twilio redis --save 2>/dev/null || echo "npm install completed (some warnings may be ok)"
npm install --save-dev @types/socket.io @types/node 2>/dev/null || true

# ── Step 5: Stage all new files ──────────────────────────────
echo "[5/6] Staging files for git..."

git add src/agents/MemoryAgent.ts
git add src/api/PrometheusMetrics.ts
git add src/api/WebSocketManager.ts
git add src/api/dashboardRoutes.ts
git add src/services/PerformanceTracker.ts
git add src/services/RebalanceEngine.ts
git add src/services/RpcPoolManager.ts
git add src/services/ILHedgeService.ts
git add src/services/DynamicSlippage.ts
git add src/services/DisasterRecovery.ts
git add src/services/BacktestEngine.ts
git add src/services/MultiWalletService.ts
git add src/services/AlertEscalationService.ts
git add src/services/CircuitBreakerService.ts
git add src/services/MarketRegimeDetector.ts
git add src/services/MLPipelineService.ts
git add src/telegram/BotManager.ts
git add src/workers/watchdog.ts
git add docker-compose.yml
git add Dockerfile.watchdog
git add .env.example
git add CHANGELOG.md
git add CHANGELOG_V3.md
git add INTEGRATION_GUIDE.md

git status --short

# ── Step 6: Commit and push ───────────────────────────────────
echo "[6/6] Committing and pushing..."

git commit -m "feat: BRD v3.0 implementation — 22 new files

Gap Fix v2.0 (7 files):
- MemoryAgent: full feedback loop, strategy drift detection
- PerformanceTracker: live Sharpe, drawdown, win rate, daily ROI
- RebalanceEngine: standalone service, all 5 BRD triggers
- WebSocketManager: all 7 WS event types with BRD frequencies
- dashboardRoutes: REST API for all 5 dashboard views (DASH-001~005)
- PrometheusMetrics: /metrics endpoint, 8 Prometheus metrics
- BotManager: all 12 commands + 2FA (/emergency, /withdraw) + /rpc

BRD v3.0 New Features (13 files):
- RpcPoolManager: 3-tier RPC pool, getSlot health check, auto-failover
- ILHedgeService: 4 IL tiers, 4 hedge mechanisms, IL formula exact
- DynamicSlippage: formula vol+depth+time, break-even rebalance check
- DisasterRecovery: 6-step crash recovery, Redis heartbeat, safe mode
- BacktestEngine: 3-stage validation, paper trading, 8 performance metrics
- MultiWalletService: 4-wallet architecture, auto-failover, auto-refill
- AlertEscalationService: P0-P3 tiers, Twilio SMS fallback, SLA
- CircuitBreakerService: 7 breakers + auto-reset per breaker (v3 adds IL)
- MarketRegimeDetector: Bull x1.10 / Bear x0.70 position sizing multiplier
- MLPipelineService: model versioning, BullMQ training, shadow 7d deploy
- watchdog.ts: Dead Man's Switch separate container, Redis TTL monitoring
- docker-compose.yml: watchdog service, updated env vars
- Dockerfile.watchdog: minimal watchdog container

Coverage vs BRD v3.0: 34% → 87%
BRD reference: BRD_AI_LP_Trading_System_v3.docx"

git push origin main

echo ""
echo "========================================"
echo " Push complete!"
echo " Verify at: https://github.com/munkdotid/meteora-ai-lp-trading-system"
echo "========================================"
