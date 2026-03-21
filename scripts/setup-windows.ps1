# ==========================================
# Windows Setup Script for Meteora AI LP Trading System
# ==========================================
# Run with: PowerShell as Administrator
# Right-click → "Run with PowerShell" atau:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# .\scripts\setup-windows.ps1
# ==========================================

param(
    [switch]$SkipPrereqCheck,
    [switch]$AutoMode,
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"

# Colors
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-Status($message, $status = "INFO") {
    $timestamp = Get-Date -Format "HH:mm:ss"
    switch ($status) {
        "OK" { Write-Host "[$timestamp] [OK] $message" -ForegroundColor $Green }
        "ERROR" { Write-Host "[$timestamp] [ERROR] $message" -ForegroundColor $Red }
        "WARNING" { Write-Host "[$timestamp] [WARNING] $message" -ForegroundColor $Yellow }
        default { Write-Host "[$timestamp] [INFO] $message" -ForegroundColor $Cyan }
    }
}

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Command($command) {
    try {
        $null = Get-Command $command -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# ==========================================
# Main Script
# ==========================================

Clear-Host
Write-Host "==========================================" -ForegroundColor $Cyan
Write-Host "  Meteora AI LP Trading System - Windows Setup" -ForegroundColor $Cyan
Write-Host "==========================================" -ForegroundColor $Cyan
Write-Host ""

# Check Administrator
if (-not (Test-Administrator)) {
    Write-Status "This script must be run as Administrator" "ERROR"
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor $Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Status "Running as Administrator" "OK"
Write-Host ""

# ==========================================
# Step 1: Check Prerequisites
# ==========================================
Write-Status "Step 1/8: Checking prerequisites..."

$prereqs = @{
    "Node.js" = { Test-Command "node" }
    "npm" = { Test-Command "npm" }
    "Git" = { Test-Command "git" }
}

$missing = @()
foreach ($name in $prereqs.Keys) {
    if (& $prereqs[$name]) {
        $version = if ($name -eq "Node.js") { & node --version } elseif ($name -eq "npm") { & npm --version } else { "installed" }
        Write-Status "$name found: $version" "OK"
    } else {
        Write-Status "$name not found" "WARNING"
        $missing += $name
    }
}

# Docker check (optional)
if (Test-Command "docker") {
    try {
        $dockerVersion = docker --version
        Write-Status "Docker found: $dockerVersion" "OK"
    } catch {
        Write-Status "Docker not running or not accessible" "WARNING"
    }
} else {
    Write-Status "Docker not found (optional)" "WARNING"
    Write-Host "  Install Docker Desktop for database: https://www.docker.com/products/docker-desktop" -ForegroundColor $Yellow
}

if ($missing.Count -gt 0) {
    Write-Status "Missing prerequisites: $($missing -join ', ')" "ERROR"
    Write-Host ""
    Write-Host "Please install missing prerequisites:" -ForegroundColor $Yellow
    Write-Host "  Node.js: https://nodejs.org/" -ForegroundColor $Cyan
    Write-Host "  Git: https://git-scm.com/download/win" -ForegroundColor $Cyan
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Status "Prerequisites check complete" "OK"
Write-Host ""

# ==========================================
# Step 2: Setup Project Directory
# ==========================================
Write-Status "Step 2/8: Setting up project directory..."

$projectDir = "C:\meteora_bot"

if (-not (Test-Path $projectDir)) {
    New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
    Write-Status "Created directory: $projectDir" "OK"
} else {
    Write-Status "Directory already exists: $projectDir" "INFO"
}

Set-Location $projectDir

# ==========================================
# Step 3: Clone or Update Repository
# ==========================================
Write-Status "Step 3/8: Checking repository..."

$repoUrl = if ($GitHubToken) {
    "https://$GitHubToken@github.com/munkdotid/meteora-ai-lp-trading-system.git"
} else {
    "https://github.com/munkdotid/meteora-ai-lp-trading-system.git"
}

if (-not (Test-Path ".git")) {
    if (Test-Path "package.json") {
        Write-Status "Files exist but no git repository. Skipping clone." "WARNING"
    } else {
        Write-Status "Repository not found. Please clone manually:" "WARNING"
        Write-Host ""
        Write-Host "  git clone $repoUrl ." -ForegroundColor $Cyan
        Write-Host ""
        
        if (-not $AutoMode) {
            $response = Read-Host "Open GitHub in browser? (Y/n)"
            if ($response -ne 'n') {
                Start-Process "https://github.com/munkdotid/meteora-ai-lp-trading-system"
            }
        }
    }
} else {
    Write-Status "Git repository found" "OK"
    
    # Check if we should pull updates
    if (-not $AutoMode) {
        $response = Read-Host "Check for updates? (y/N)"
        if ($response -eq 'y') {
            Write-Status "Pulling updates..."
            try {
                git pull
                Write-Status "Repository updated" "OK"
            } catch {
                Write-Status "Could not pull updates: $_" "WARNING"
            }
        }
    }
}

if (-not (Test-Path "package.json")) {
    Write-Status "package.json not found. Repository may not be cloned correctly." "ERROR"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Status "Repository check complete" "OK"
Write-Host ""

# ==========================================
# Step 4: Create Required Folders
# ==========================================
Write-Status "Step 4/8: Creating required folders..."

$folders = @("logs", "secrets", "data")
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Status "Created folder: $folder" "OK"
    }
}

# Set permissions for secrets folder
$secretsPath = Join-Path $projectDir "secrets"
$acl = Get-Acl $secretsPath
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    "FullControl",
    "ContainerInherit,ObjectInherit",
    "None",
    "Allow"
)
$acl.SetAccessRule($rule)
Set-Acl $secretsPath $acl
Write-Status "Set permissions for secrets folder" "OK"

Write-Host ""

# ==========================================
# Step 5: Install Dependencies
# ==========================================
Write-Status "Step 5/8: Installing dependencies..."
Write-Host "This may take 10-15 minutes..." -ForegroundColor $Yellow
Write-Host ""

try {
    npm install 2>&1 | ForEach-Object {
        if ($_ -match "error|ERR|failed" -and $_ -notmatch "warn|WARN") {
            Write-Host "  $_" -ForegroundColor $Red
        } elseif ($_ -match "added|removed|changed|audited") {
            Write-Host "  $_" -ForegroundColor $Green
        }
    }
    
    Write-Status "Dependencies installed" "OK"
} catch {
    Write-Status "npm install failed, retrying with force..." "WARNING"
    npm install --force
}

Write-Host ""

# ==========================================
# Step 6: Setup Environment
# ==========================================
Write-Status "Step 6/8: Setting up environment..."

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Status "Created .env from .env.example" "OK"
        
        Write-Host ""
        Write-Host "IMPORTANT: Please edit .env file with your configuration:" -ForegroundColor $Yellow
        Write-Host "  - Set SOLANA_NETWORK=devnet (for testing)" -ForegroundColor $Cyan
        Write-Host "  - Add your wallet private key or key file path" -ForegroundColor $Cyan
        Write-Host "  - Set DRY_RUN=true for testing" -ForegroundColor $Cyan
        Write-Host "  - Configure database connection" -ForegroundColor $Cyan
        Write-Host ""
        
        if (-not $AutoMode) {
            $response = Read-Host "Open .env in notepad? (Y/n)"
            if ($response -ne 'n') {
                notepad ".env"
            }
        }
    } else {
        Write-Status ".env.example not found. Please create .env manually." "WARNING"
    }
} else {
    Write-Status ".env file already exists" "OK"
}

Write-Host ""

# ==========================================
# Step 7: Build Application
# ==========================================
Write-Status "Step 7/8: Building application..."

try {
    npm run build 2>&1 | ForEach-Object {
        if ($_ -match "error|Error|ERROR" -and $_ -notmatch "0 errors") {
            Write-Host "  $_" -ForegroundColor $Red
        } elseif ($_ -match "successfully|Success|created") {
            Write-Host "  $_" -ForegroundColor $Green
        }
    }
    
    if (Test-Path "dist\index.js") {
        Write-Status "Build successful" "OK"
    } else {
        throw "Build output not found"
    }
} catch {
    Write-Status "Build had issues: $_" "WARNING"
    Write-Host "You may need to:" -ForegroundColor $Yellow
    Write-Host "  1. Check TypeScript errors: npm run typecheck" -ForegroundColor $Cyan
    Write-Host "  2. Fix any issues" -ForegroundColor $Cyan
    Write-Host "  3. Rebuild: npm run build" -ForegroundColor $Cyan
}

Write-Host ""

# ==========================================
# Step 8: Docker Setup (if available)
# ==========================================
Write-Status "Step 8/8: Docker setup..."

if (Test-Command "docker-compose") {
    if (-not $AutoMode) {
        $response = Read-Host "Start Docker containers (PostgreSQL + Redis)? (Y/n)"
        if ($response -ne 'n') {
            try {
                docker-compose up -d postgres redis
                Write-Status "Docker containers started" "OK"
                
                # Wait for containers to be ready
                Write-Host "Waiting for containers to be ready..." -ForegroundColor $Yellow
                Start-Sleep -Seconds 10
                
                # Run migrations
                Write-Status "Running database migrations..."
                npx prisma migrate dev --name init
                Write-Status "Database setup complete" "OK"
            } catch {
                Write-Status "Docker setup failed: $_" "WARNING"
                Write-Host "You can start containers later with: docker-compose up -d" -ForegroundColor $Cyan
            }
        }
    }
} else {
    Write-Status "Docker not available, skipping container setup" "WARNING"
    Write-Host "You'll need to setup database manually or install Docker Desktop" -ForegroundColor $Yellow
}

Write-Host ""

# ==========================================
# Setup Complete
# ==========================================
Write-Host "==========================================" -ForegroundColor $Green
Write-Host "  Setup Complete!" -ForegroundColor $Green
Write-Host "==========================================" -ForegroundColor $Green
Write-Host ""
Write-Status "Project directory: $projectDir"
Write-Host ""

Write-Host "Next steps:" -ForegroundColor $Cyan
Write-Host "  1. Edit .env file with your configuration" -ForegroundColor $Yellow
Write-Host "  2. Start Docker Desktop (if installed)" -ForegroundColor $Yellow
Write-Host "  3. Start database: docker-compose up -d postgres redis" -ForegroundColor $Yellow
Write-Host "  4. Test in DRY_RUN mode: npm start" -ForegroundColor $Yellow
Write-Host "  5. Or with hot reload: npm run dev" -ForegroundColor $Yellow
Write-Host ""

Write-Host "Useful commands:" -ForegroundColor $Cyan
Write-Host "  cd $projectDir" -ForegroundColor $Yellow
Write-Host "  npm start          - Start application" -ForegroundColor $Yellow
Write-Host "  npm run dev        - Start with hot reload" -ForegroundColor $Yellow
Write-Host "  npm run build      - Build TypeScript" -ForegroundColor $Yellow
Write-Host "  npx prisma studio  - Open database GUI" -ForegroundColor $Yellow
Write-Host ""

Write-Host "Documentation:" -ForegroundColor $Cyan
Write-Host "  WINDOWS_DEPLOYMENT_GUIDE.md" -ForegroundColor $Yellow
Write-Host "  QUICKSTART.md" -ForegroundColor $Yellow
Write-Host "  README.md" -ForegroundColor $Yellow
Write-Host ""

if (-not $AutoMode) {
    $response = Read-Host "Open project in VS Code? (Y/n)"
    if ($response -ne 'n') {
        try {
            code $projectDir
        } catch {
            Write-Status "Could not open VS Code" "WARNING"
        }
    }
}

Write-Host ""
Write-Status "Setup complete! Happy trading! 🚀"
Read-Host "Press Enter to exit"
