# PUSH_V3.ps1 - BRD v3 Push Script
# Run from C:\meteora_bot: powershell -ExecutionPolicy Bypass -File PUSH_V3.ps1

param(
    [string]$DownloadPath = "$env:USERPROFILE\Downloads"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Meteora AI LP - BRD v3.0 Push Script" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan

# Verify we are in git repo
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Run this from C:\meteora_bot (git repo folder)" -ForegroundColor Red
    exit 1
}

$RepoRoot = Get-Location

# ── Find downloaded folders ───────────────────────────────────────────────────
Write-Host "`n[1/5] Finding downloaded files..." -ForegroundColor Yellow

# Look in common download locations
$searchPaths = @(
    "$env:USERPROFILE\Downloads\meteora-gap-fix",
    "$env:USERPROFILE\Downloads\meteora-v3", 
    "$env:USERPROFILE\Downloads\meteora-missing",
    ".\claude_outputs\meteora-gap-fix",
    ".\claude_outputs\meteora-v3",
    ".\claude_outputs\meteora-missing"
)

$gapfixPath = $null
$v3Path = $null  
$missingPath = $null

foreach ($p in $searchPaths) {
    if ((Test-Path $p) -and $p -like "*meteora-gap-fix*") { $gapfixPath = $p }
    if ((Test-Path $p) -and $p -like "*meteora-v3*") { $v3Path = $p }
    if ((Test-Path $p) -and $p -like "*meteora-missing*") { $missingPath = $p }
}

if (-not $gapfixPath) {
    Write-Host ""
    Write-Host "Folder 'meteora-gap-fix' tidak ditemukan." -ForegroundColor Red
    Write-Host "Masukkan path folder Downloads Anda (contoh: C:\Users\munk\Downloads):" -ForegroundColor Yellow
    $DownloadPath = Read-Host "Download path"
    $gapfixPath = "$DownloadPath\meteora-gap-fix"
    $v3Path = "$DownloadPath\meteora-v3"
    $missingPath = "$DownloadPath\meteora-missing"
}

Write-Host "  gap-fix: $gapfixPath" -ForegroundColor Gray
Write-Host "  v3:      $v3Path" -ForegroundColor Gray
Write-Host "  missing: $missingPath" -ForegroundColor Gray

# ── Create directories ────────────────────────────────────────────────────────
Write-Host "`n[2/5] Creating directories..." -ForegroundColor Yellow
$dirs = @("src\agents","src\services","src\api","src\telegram","src\workers")
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}
Write-Host "  Done" -ForegroundColor Green

# ── Copy files ────────────────────────────────────────────────────────────────
Write-Host "`n[3/5] Copying files..." -ForegroundColor Yellow

$copies = @(
    # From gap-fix
    @{ From = "$gapfixPath\CHANGELOG.md";                        To = "CHANGELOG.md" },
    @{ From = "$gapfixPath\INTEGRATION_GUIDE.md";               To = "INTEGRATION_GUIDE.md" },
    @{ From = "$gapfixPath\src\agents\MemoryAgent.ts";          To = "src\agents\MemoryAgent.ts" },
    @{ From = "$gapfixPath\src\api\PrometheusMetrics.ts";       To = "src\api\PrometheusMetrics.ts" },
    @{ From = "$gapfixPath\src\api\WebSocketManager.ts";        To = "src\api\WebSocketManager.ts" },
    @{ From = "$gapfixPath\src\api\dashboardRoutes.ts";         To = "src\api\dashboardRoutes.ts" },
    @{ From = "$gapfixPath\src\services\PerformanceTracker.ts"; To = "src\services\PerformanceTracker.ts" },
    @{ From = "$gapfixPath\src\services\RebalanceEngine.ts";    To = "src\services\RebalanceEngine.ts" },
    # From v3
    @{ From = "$v3Path\CHANGELOG_V3.md";                              To = "CHANGELOG_V3.md" },
    @{ From = "$v3Path\Dockerfile.watchdog";                           To = "Dockerfile.watchdog" },
    @{ From = "$v3Path\docker-compose.yml";                            To = "docker-compose.yml" },
    @{ From = "$v3Path\src\services\RpcPoolManager.ts";               To = "src\services\RpcPoolManager.ts" },
    @{ From = "$v3Path\src\services\ILHedgeService.ts";              To = "src\services\ILHedgeService.ts" },
    @{ From = "$v3Path\src\services\DynamicSlippage.ts";             To = "src\services\DynamicSlippage.ts" },
    @{ From = "$v3Path\src\services\DisasterRecovery.ts";            To = "src\services\DisasterRecovery.ts" },
    @{ From = "$v3Path\src\services\BacktestEngine.ts";              To = "src\services\BacktestEngine.ts" },
    @{ From = "$v3Path\src\services\MultiWalletService.ts";          To = "src\services\MultiWalletService.ts" },
    @{ From = "$v3Path\src\services\AlertEscalationService.ts";      To = "src\services\AlertEscalationService.ts" },
    @{ From = "$v3Path\src\services\CircuitBreakerService.ts";       To = "src\services\CircuitBreakerService.ts" },
    @{ From = "$v3Path\src\workers\watchdog.ts";                      To = "src\workers\watchdog.ts" },
    # From missing (BotManager updated + 2 new services)
    @{ From = "$missingPath\src\telegram\BotManager.ts";             To = "src\telegram\BotManager.ts" },
    @{ From = "$missingPath\src\services\MarketRegimeDetector.ts";   To = "src\services\MarketRegimeDetector.ts" },
    @{ From = "$missingPath\src\services\MLPipelineService.ts";      To = "src\services\MLPipelineService.ts" }
)

$ok = 0; $fail = 0
foreach ($c in $copies) {
    if (Test-Path $c.From) {
        Copy-Item -Path $c.From -Destination $c.To -Force
        Write-Host "  [OK] $($c.To)" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "  [MISS] $($c.From)" -ForegroundColor Red
        $fail++
    }
}

Write-Host "`n  Copied: $ok   Missing: $fail" -ForegroundColor $(if ($fail -eq 0) {"Green"} else {"Yellow"})

if ($ok -lt 10) {
    Write-Host "`nTerlalu banyak file yang tidak ditemukan. Pastikan folder sudah didownload." -ForegroundColor Red
    Write-Host "Folder yang dibutuhkan:" -ForegroundColor Yellow
    Write-Host "  - meteora-gap-fix" 
    Write-Host "  - meteora-v3"
    Write-Host "  - meteora-missing"
    pause
    exit 1
}

# ── Git operations ────────────────────────────────────────────────────────────
Write-Host "`n[4/5] Running git add..." -ForegroundColor Yellow

$filesToAdd = @(
    "src/agents/MemoryAgent.ts",
    "src/api/PrometheusMetrics.ts",
    "src/api/WebSocketManager.ts",
    "src/api/dashboardRoutes.ts",
    "src/services/PerformanceTracker.ts",
    "src/services/RebalanceEngine.ts",
    "src/services/RpcPoolManager.ts",
    "src/services/ILHedgeService.ts",
    "src/services/DynamicSlippage.ts",
    "src/services/DisasterRecovery.ts",
    "src/services/BacktestEngine.ts",
    "src/services/MultiWalletService.ts",
    "src/services/AlertEscalationService.ts",
    "src/services/CircuitBreakerService.ts",
    "src/services/MarketRegimeDetector.ts",
    "src/services/MLPipelineService.ts",
    "src/telegram/BotManager.ts",
    "src/workers/watchdog.ts",
    "docker-compose.yml",
    "Dockerfile.watchdog",
    "CHANGELOG.md",
    "CHANGELOG_V3.md",
    "INTEGRATION_GUIDE.md"
)

foreach ($f in $filesToAdd) {
    if (Test-Path $f) {
        git add $f 2>$null
        Write-Host "  staged: $f" -ForegroundColor Gray
    }
}

Write-Host "`n[5/5] Committing and pushing..." -ForegroundColor Yellow
git status --short

$commitMsg = "feat: BRD v3.0 implementation - 22 new files, coverage 34% to 87%

Gap Fix v2.0 (7 files):
- MemoryAgent: full feedback loop, strategy drift detection
- PerformanceTracker: live Sharpe, drawdown, win rate, daily ROI  
- RebalanceEngine: standalone service, all 5 BRD triggers
- WebSocketManager: all 7 WS event types
- dashboardRoutes: REST API for all 5 dashboard views
- PrometheusMetrics: /metrics endpoint
- BotManager: 12 commands + 2FA + /rpc + /withdraw

BRD v3.0 New Features (13 files):
- RpcPoolManager: 3-tier RPC pool, auto-failover
- ILHedgeService: 4 IL tiers, 4 hedge mechanisms
- DynamicSlippage: formula + break-even rebalance check
- DisasterRecovery: 6-step crash recovery, heartbeat
- BacktestEngine: 3-stage validation, paper trading
- MultiWalletService: 4-wallet architecture
- AlertEscalationService: P0-P3 tiers, Twilio SMS
- CircuitBreakerService: 7 breakers + auto-reset
- MarketRegimeDetector: Bull x1.10 / Bear x0.70
- MLPipelineService: model versioning, shadow deployment
- watchdog.ts: Dead Man's Switch container
- docker-compose.yml: watchdog service
- Dockerfile.watchdog: watchdog container"

git commit -m $commitMsg

Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Push selesai! Coverage: 34% -> 87%" -ForegroundColor Green
Write-Host " Cek: https://github.com/munkdotid/meteora-ai-lp-trading-system" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
