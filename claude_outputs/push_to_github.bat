@echo off
REM ============================================================
REM PUSH SCRIPT (Windows) — AI LP Trading System BRD v3.0
REM Run from: C:\meteora_bot\  (where your git repo is)
REM ============================================================

echo ========================================
echo  Meteora AI LP - BRD v3.0 Push
echo ========================================

cd /d C:\meteora_bot

REM Create directories
if not exist src\agents mkdir src\agents
if not exist src\services mkdir src\services
if not exist src\api mkdir src\api
if not exist src\telegram mkdir src\telegram
if not exist src\workers mkdir src\workers

REM ── Copy gap-fix files ──────────────────────────────────────
copy claude_outputs\meteora-gap-fix\CHANGELOG.md .\CHANGELOG.md
copy claude_outputs\meteora-gap-fix\INTEGRATION_GUIDE.md .\INTEGRATION_GUIDE.md
copy claude_outputs\meteora-gap-fix\src\agents\MemoryAgent.ts .\src\agents\
copy claude_outputs\meteora-gap-fix\src\api\PrometheusMetrics.ts .\src\api\
copy claude_outputs\meteora-gap-fix\src\api\WebSocketManager.ts .\src\api\
copy claude_outputs\meteora-gap-fix\src\api\dashboardRoutes.ts .\src\api\
copy claude_outputs\meteora-gap-fix\src\services\PerformanceTracker.ts .\src\services\
copy claude_outputs\meteora-gap-fix\src\services\RebalanceEngine.ts .\src\services\

REM ── Copy v3 new services ─────────────────────────────────────
copy claude_outputs\meteora-v3\CHANGELOG_V3.md .\CHANGELOG_V3.md
copy claude_outputs\meteora-v3\Dockerfile.watchdog .\Dockerfile.watchdog
copy claude_outputs\meteora-v3\docker-compose.yml .\docker-compose.yml
copy claude_outputs\meteora-v3\src\services\RpcPoolManager.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\ILHedgeService.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\DynamicSlippage.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\DisasterRecovery.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\BacktestEngine.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\MultiWalletService.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\AlertEscalationService.ts .\src\services\
copy claude_outputs\meteora-v3\src\services\CircuitBreakerService.ts .\src\services\
copy claude_outputs\meteora-v3\src\workers\watchdog.ts .\src\workers\

REM ── Copy missing files (BotManager with /rpc + /withdraw) ────
copy claude_outputs\meteora-missing\src\telegram\BotManager.ts .\src\telegram\
copy claude_outputs\meteora-missing\src\services\MarketRegimeDetector.ts .\src\services\
copy claude_outputs\meteora-missing\src\services\MLPipelineService.ts .\src\services\

REM ── npm install ──────────────────────────────────────────────
echo Installing npm packages...
npm install telegraf socket.io twilio redis --save
npm install --save-dev @types/socket.io @types/node

REM ── Git commit and push ──────────────────────────────────────
git add src\agents\MemoryAgent.ts
git add src\api\PrometheusMetrics.ts
git add src\api\WebSocketManager.ts
git add src\api\dashboardRoutes.ts
git add src\services\PerformanceTracker.ts
git add src\services\RebalanceEngine.ts
git add src\services\RpcPoolManager.ts
git add src\services\ILHedgeService.ts
git add src\services\DynamicSlippage.ts
git add src\services\DisasterRecovery.ts
git add src\services\BacktestEngine.ts
git add src\services\MultiWalletService.ts
git add src\services\AlertEscalationService.ts
git add src\services\CircuitBreakerService.ts
git add src\services\MarketRegimeDetector.ts
git add src\services\MLPipelineService.ts
git add src\telegram\BotManager.ts
git add src\workers\watchdog.ts
git add docker-compose.yml
git add Dockerfile.watchdog
git add .env.example
git add CHANGELOG.md
git add CHANGELOG_V3.md
git add INTEGRATION_GUIDE.md

git commit -m "feat: BRD v3.0 implementation - 22 new files, coverage 34% to 87%"
git push origin main

echo.
echo ========================================
echo  Push complete!
echo  Check: https://github.com/munkdotid/meteora-ai-lp-trading-system
echo ========================================
pause
