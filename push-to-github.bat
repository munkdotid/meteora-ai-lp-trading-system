@echo off
REM ==========================================
REM Push to GitHub Script for Windows
REM AI LP Trading System
REM ==========================================

echo ==========================================
echo  Push AI LP Trading System to GitHub
echo ==========================================
echo.

REM Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH
    echo.
    echo Please install Git first:
    echo 1. Download from: https://git-scm.com/download/win
    echo 2. Install with default settings
    echo 3. Restart this script
    echo.
    pause
    exit /b 1
)

echo [OK] Git found
git --version
echo.

REM Navigate to project directory
cd /d "C:\meteora_bot"

REM Initialize git if not already done
if not exist ".git" (
    echo [INFO] Initializing git repository...
    git init
    echo [OK] Repository initialized
) else (
    echo [OK] Git repository already initialized
)
echo.

REM Configure git user if not set
git config --get user.name >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Please configure git user:
    set /p GIT_NAME="Enter your name: "
    set /p GIT_EMAIL="Enter your email: "
    git config user.name "%GIT_NAME%"
    git config user.email "%GIT_EMAIL%"
    echo [OK] Git user configured
)
echo.

REM Add remote repository
echo [INFO] Adding remote repository...
git remote remove origin 2>nul
git remote add origin https://github.com/munkdotid/meteora-ai-lp-trading-system.git
echo [OK] Remote repository added
echo.

REM Check repository status
echo [INFO] Checking repository status...
git status
echo.

REM Add all files
echo [INFO] Adding all files to git...
git add .
echo [OK] Files added
echo.

REM Commit
echo [INFO] Creating commit...
git commit -m "Initial commit: AI LP Trading System for Meteora DLMM

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

Ready for production deployment on Ubuntu VPS."

if %errorlevel% neq 0 (
    echo [WARNING] Commit may have failed or nothing to commit
) else (
    echo [OK] Commit created successfully
)
echo.

REM Push to GitHub
echo [INFO] Pushing to GitHub...
echo Repository: https://github.com/munkdotid/meteora-ai-lp-trading-system
echo.
echo You may be prompted for:
echo - Username: Your GitHub username
echo - Password: Your GitHub Personal Access Token (NOT your password)
echo.
echo To create a Personal Access Token:
echo 1. Go to: https://github.com/settings/tokens
echo 2. Click "Generate new token (classic)"
echo 3. Select scopes: repo, read:org
echo 4. Generate and copy the token
echo 5. Use the token as your password
echo.

git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Push failed. Trying with 'master' branch...
    git branch -M master
    git push -u origin master
    
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Push failed. Possible reasons:
        echo - Wrong credentials
        echo - Repository doesn't exist
        echo - Network issues
        echo.
        echo Please check:
        echo 1. Repository exists at:
        echo    https://github.com/munkdotid/meteora-ai-lp-trading-system
        echo 2. You have write access
        echo 3. Your Personal Access Token is valid
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ==========================================
echo [SUCCESS] Code pushed to GitHub!
echo ==========================================
echo.
echo Repository URL:
echo https://github.com/munkdotid/meteora-ai-lp-trading-system
echo.
echo Next steps:
echo 1. Visit the repository URL above to verify
echo 2. Check that all files are uploaded
echo 3. Review README.md rendering
echo 4. Setup Ubuntu VPS using UBUNTU_SETUP.md
echo.
pause
