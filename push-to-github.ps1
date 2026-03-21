# ==========================================
# Push to GitHub Script for PowerShell
# AI LP Trading System
# ==========================================

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Push AI LP Trading System to GitHub" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is installed
try {
    $gitVersion = git --version
    Write-Host "[OK] Git found: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Git is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Git first:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://git-scm.com/download/win"
    Write-Host "2. Install with default settings"
    Write-Host "3. Restart this script"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Navigate to project directory
$projectPath = "C:\meteora_bot"
Set-Location -Path $projectPath

# Initialize git if not already done
if (-not (Test-Path ".git")) {
    Write-Host "[INFO] Initializing git repository..." -ForegroundColor Yellow
    git init
    Write-Host "[OK] Repository initialized" -ForegroundColor Green
} else {
    Write-Host "[OK] Git repository already initialized" -ForegroundColor Green
}

Write-Host ""

# Configure git user if not set
$gitName = git config --get user.name 2>$null
$gitEmail = git config --get user.email 2>$null

if (-not $gitName -or -not $gitEmail) {
    Write-Host "[INFO] Please configure git user:" -ForegroundColor Yellow
    $newName = Read-Host "Enter your name"
    $newEmail = Read-Host "Enter your email"
    git config user.name "$newName"
    git config user.email "$newEmail"
    Write-Host "[OK] Git user configured" -ForegroundColor Green
}

Write-Host ""

# Add remote repository
Write-Host "[INFO] Adding remote repository..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin https://github.com/munkdotid/meteora-ai-lp-trading-system.git
Write-Host "[OK] Remote repository added" -ForegroundColor Green
Write-Host ""

# Check repository status
Write-Host "[INFO] Checking repository status..." -ForegroundColor Yellow
git status
Write-Host ""

# Add all files
Write-Host "[INFO] Adding all files to git..." -ForegroundColor Yellow
git add .
Write-Host "[OK] Files added" -ForegroundColor Green
Write-Host ""

# Commit
Write-Host "[INFO] Creating commit..." -ForegroundColor Yellow
$commitMessage = @"
Initial commit: AI LP Trading System for Meteora DLMM

Complete multi-agent AI trading system including:
- Scout Agent: Pool scanning and opportunity detection
- Analyst Agent: AI-powered strategy selection
- Risk Manager: Multi-layer risk management with circuit breakers
- Auto Rebalance System: Intelligent range adjustment
- Telegram Integration: Full mobile control and notifications
- Ubuntu/Linux compatibility with deployment scripts
- Docker and Docker Compose configuration
- Comprehensive documentation (BRD, Architecture, Setup guides)
- Database schema with Prisma ORM
- Nginx reverse proxy configuration
- Health monitoring and backup scripts

Ready for production deployment on Ubuntu VPS.
"@

git commit -m "$commitMessage"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Commit may have failed or nothing to commit" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Commit created successfully" -ForegroundColor Green
}

Write-Host ""

# Push to GitHub
Write-Host "[INFO] Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "Repository: https://github.com/munkdotid/meteora-ai-lp-trading-system" -ForegroundColor Cyan
Write-Host ""
Write-Host "You may be prompted for credentials:" -ForegroundColor Yellow
Write-Host "- Username: Your GitHub username" -ForegroundColor White
Write-Host "- Password: Your GitHub Personal Access Token (NOT your password)" -ForegroundColor White
Write-Host ""
Write-Host "To create a Personal Access Token:" -ForegroundColor Yellow
Write-Host "1. Go to: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "2. Click 'Generate new token (classic)'" -ForegroundColor White
Write-Host "3. Select scopes: repo, read:org" -ForegroundColor White
Write-Host "4. Generate and copy the token" -ForegroundColor White
Write-Host "5. Use the token as your password" -ForegroundColor White
Write-Host ""

try {
    git push -u origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Push failed"
    }
} catch {
    Write-Host "[ERROR] Push failed. Trying with 'master' branch..." -ForegroundColor Red
    git branch -M master
    git push -u origin master
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] Push failed. Possible reasons:" -ForegroundColor Red
        Write-Host "- Wrong credentials" -ForegroundColor Yellow
        Write-Host "- Repository doesn't exist" -ForegroundColor Yellow
        Write-Host "- Network issues" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Please check:" -ForegroundColor Yellow
        Write-Host "1. Repository exists at:" -ForegroundColor White
        Write-Host "   https://github.com/munkdotid/meteora-ai-lp-trading-system" -ForegroundColor White
        Write-Host "2. You have write access" -ForegroundColor White
        Write-Host "3. Your Personal Access Token is valid" -ForegroundColor White
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "[SUCCESS] Code pushed to GitHub!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Repository URL:" -ForegroundColor Cyan
Write-Host "https://github.com/munkdotid/meteora-ai-lp-trading-system" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Visit the repository URL above to verify" -ForegroundColor White
Write-Host "2. Check that all files are uploaded" -ForegroundColor White
Write-Host "3. Review README.md rendering" -ForegroundColor White
Write-Host "4. Setup Ubuntu VPS using UBUNTU_SETUP.md" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
