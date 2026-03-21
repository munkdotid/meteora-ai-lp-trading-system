# ==========================================
# Management Script for Meteora AI LP Bot
# Windows PowerShell
# ==========================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "db", "prisma", "clean", "update")]
    [string]$Action,
    
    [switch]$DryRun,
    [switch]$Dev,
    [switch]$Build
)

$ErrorActionPreference = "Stop"

# Colors
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-Color($message, $color) {
    Write-Host $message -ForegroundColor $color
}

function Get-ProjectRoot() {
    return Split-Path $PSScriptRoot -Parent
}

function Show-Status() {
    Write-Color "========================================" $Cyan
    Write-Color "  Meteora AI LP - Status" $Cyan
    Write-Color "========================================" $Cyan
    Write-Host ""
    
    $projectRoot = Get-ProjectRoot
    
    # Check if .env exists
    if (Test-Path (Join-Path $projectRoot ".env")) {
        Write-Color "✅ .env file: Found" $Green
    } else {
        Write-Color "❌ .env file: Not found" $Red
    }
    
    # Check if dependencies installed
    if (Test-Path (Join-Path $projectRoot "node_modules")) {
        Write-Color "✅ Dependencies: Installed" $Green
    } else {
        Write-Color "❌ Dependencies: Not installed" $Red
    }
    
    # Check if build exists
    if (Test-Path (Join-Path $projectRoot "dist" "index.js")) {
        Write-Color "✅ Build: Ready" $Green
    } else {
        Write-Color "⚠️  Build: Not compiled" $Yellow
    }
    
    # Check Docker containers
    try {
        $postgres = docker ps --filter "name=meteora-postgres-dev" --format "{{.Names}}" 2>$null
        $redis = docker ps --filter "name=meteora-redis-dev" --format "{{.Names}}" 2>$null
        
        if ($postgres) {
            Write-Color "✅ PostgreSQL: Running" $Green
        } else {
            Write-Color "⚠️  PostgreSQL: Not running" $Yellow
        }
        
        if ($redis) {
            Write-Color "✅ Redis: Running" $Green
        } else {
            Write-Color "⚠️  Redis: Not running" $Yellow
        }
    } catch {
        Write-Color "⚠️  Docker: Not available or not running" $Yellow
    }
    
    # Check if bot is running
    $process = Get-Process -Name "node" -ErrorAction SilentlyContinue | 
               Where-Object { $_.CommandLine -like "*meteora*" -or $_.CommandLine -like "*dist*index*" }
    
    if ($process) {
        Write-Color "✅ Bot Process: Running (PID: $($process.Id))" $Green
    } else {
        Write-Color "⚠️  Bot Process: Not running" $Yellow
    }
    
    Write-Host ""
}

function Start-Bot() {
    $projectRoot = Get-ProjectRoot
    Set-Location $projectRoot
    
    Write-Color "Starting Meteora AI LP Bot..." $Cyan
    Write-Host ""
    
    # Check prerequisites
    if (-not (Test-Path (Join-Path $projectRoot ".env"))) {
        Write-Color "❌ .env file not found!" $Red
        Write-Color "Run: .\scripts\env-setup.ps1" $Yellow
        return
    }
    
    if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
        Write-Color "⚠️  Dependencies not installed. Installing..." $Yellow
        npm install
    }
    
    if (-not (Test-Path (Join-Path $projectRoot "dist" "index.js")) -or $Build) {
        Write-Color "⚠️  Building application..." $Yellow
        npm run build
    }
    
    # Start Docker if needed
    try {
        $postgres = docker ps --filter "name=meteora-postgres-dev" --format "{{.Names}}" 2>$null
        if (-not $postgres) {
            Write-Color "🐳 Starting Docker containers..." $Cyan
            docker-compose -f docker-compose.dev.yml up -d postgres redis
            Start-Sleep -Seconds 5
        }
    } catch {
        Write-Color "⚠️  Docker not available. Make sure database is configured in .env" $Yellow
    }
    
    # Set environment variables
    if ($DryRun) {
        $env:DRY_RUN = "true"
        Write-Color "🧪 DRY RUN MODE ENABLED - No real transactions" $Yellow
    }
    
    if ($Dev) {
        Write-Color "🔧 DEVELOPMENT MODE - Hot reload enabled" $Cyan
        npm run dev
    } else {
        Write-Color "🚀 Starting bot in production mode..." $Green
        npm start
    }
}

function Stop-Bot() {
    Write-Color "Stopping Meteora AI LP Bot..." $Cyan
    
    # Find and stop Node process
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | 
                 Where-Object { $_.CommandLine -like "*meteora*" -or $_.CommandLine -like "*dist*index*" }
    
    foreach ($proc in $processes) {
        Write-Color "Stopping process PID: $($proc.Id)" $Yellow
        Stop-Process -Id $proc.Id -Force
    }
    
    Write-Color "✅ Bot stopped" $Green
}

function Show-Logs() {
    $projectRoot = Get-ProjectRoot
    $logPath = Join-Path $projectRoot "logs" "app.log"
    
    if (Test-Path $logPath) {
        Write-Color "Showing logs (last 50 lines, press Ctrl+C to exit)..." $Cyan
        Get-Content $logPath -Wait -Tail 50
    } else {
        Write-Color "❌ Log file not found: $logPath" $Red
        Write-Color "Start the bot first to create logs" $Yellow
    }
}

function Manage-Database() {
    Write-Color "Database Management" $Cyan
    Write-Host ""
    Write-Color "1. Start database containers" $Green
    Write-Color "2. Stop database containers" $Red
    Write-Color "3. Reset database (WARNING: All data will be lost!)" $Red
    Write-Color "4. View database logs" $Cyan
    Write-Color "5. Open Prisma Studio" $Cyan
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-5)"
    
    switch ($choice) {
        "1" {
            Write-Color "🐳 Starting database containers..." $Cyan
            docker-compose -f (Join-Path (Get-ProjectRoot) "docker-compose.dev.yml") up -d postgres redis
            Write-Color "✅ Database containers started" $Green
        }
        "2" {
            Write-Color "🛑 Stopping database containers..." $Cyan
            docker-compose -f (Join-Path (Get-ProjectRoot) "docker-compose.dev.yml") down
            Write-Color "✅ Database containers stopped" $Green
        }
        "3" {
            Write-Color "⚠️  WARNING: This will DELETE all database data!" $Red
            $confirm = Read-Host "Type 'DELETE' to confirm"
            if ($confirm -eq "DELETE") {
                docker-compose -f (Join-Path (Get-ProjectRoot) "docker-compose.dev.yml") down -v
                Write-Color "✅ Database reset" $Green
            } else {
                Write-Color "Cancelled" $Yellow
            }
        }
        "4" {
            docker-compose -f (Join-Path (Get-ProjectRoot) "docker-compose.dev.yml") logs -f postgres
        }
        "5" {
            Set-Location (Get-ProjectRoot)
            npx prisma studio
        }
        default {
            Write-Color "Invalid choice" $Red
        }
    }
}

function Run-Prisma() {
    Write-Color "Prisma Commands" $Cyan
    Write-Host ""
    Write-Color "1. Generate Prisma Client" $Green
    Write-Color "2. Run migrations" $Green
    Write-Color "3. Create new migration" $Green
    Write-Color "4. Reset database" $Red
    Write-Color "5. Seed database" $Yellow
    Write-Color "6. Validate schema" $Cyan
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-6)"
    
    Set-Location (Get-ProjectRoot)
    
    switch ($choice) {
        "1" { npx prisma generate }
        "2" { npx prisma migrate dev }
        "3" { 
            $name = Read-Host "Enter migration name"
            npx prisma migrate dev --name $name 
        }
        "4" { 
            Write-Color "⚠️  WARNING: This will reset the database!" $Red
            $confirm = Read-Host "Type 'RESET' to confirm"
            if ($confirm -eq "RESET") {
                npx prisma migrate reset --force
            }
        }
        "5" { npx prisma db seed }
        "6" { npx prisma validate }
        default { Write-Color "Invalid choice" $Red }
    }
}

function Clean-Project() {
    Write-Color "Clean Project" $Cyan
    Write-Host ""
    Write-Color "This will remove:" $Yellow
    Write-Color "  - node_modules/" $Red
    Write-Color "  - dist/" $Red
    Write-Color "  - logs/*.log" $Red
    Write-Color "  - Prisma migrations" $Red
    Write-Host ""
    
    $confirm = Read-Host "Type 'CLEAN' to confirm"
    if ($confirm -eq "CLEAN") {
        $projectRoot = Get-ProjectRoot
        
        Write-Color "🧹 Cleaning..." $Cyan
        
        Remove-Item (Join-Path $projectRoot "node_modules") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $projectRoot "dist") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $projectRoot "logs" "*.log") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $projectRoot "prisma" "migrations") -Recurse -Force -ErrorAction SilentlyContinue
        
        Write-Color "✅ Project cleaned" $Green
        Write-Color "Run 'npm install' and 'npm run build' to rebuild" $Yellow
    } else {
        Write-Color "Cancelled" $Yellow
    }
}

function Update-Project() {
    Write-Color "Update Project" $Cyan
    Write-Host ""
    
    $projectRoot = Get-ProjectRoot
    Set-Location $projectRoot
    
    Write-Color "🔄 Pulling latest changes from git..." $Cyan
    git pull
    
    Write-Color "📦 Updating dependencies..." $Cyan
    npm update
    
    Write-Color "🔨 Rebuilding application..." $Cyan
    npm run build
    
    Write-Color "✅ Project updated" $Green
}

# ==========================================
# Main Execution
# ==========================================

switch ($Action) {
    "start" { Start-Bot }
    "stop" { Stop-Bot }
    "restart" { Stop-Bot; Start-Sleep 2; Start-Bot }
    "status" { Show-Status }
    "logs" { Show-Logs }
    "db" { Manage-Database }
    "prisma" { Run-Prisma }
    "clean" { Clean-Project }
    "update" { Update-Project }
    default { 
        Write-Color "Usage: .\scripts\manage.ps1 <action>" $Yellow
        Write-Color "Actions: start, stop, restart, status, logs, db, prisma, clean, update" $Cyan
    }
}
