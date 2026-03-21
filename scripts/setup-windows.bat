@echo off
REM ==========================================
REM Windows Setup Script for Meteora AI LP Trading System
REM ==========================================

setlocal EnableDelayedExpansion

echo ==========================================
echo  Windows Setup - Meteora AI LP Trading System
echo ==========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator
echo.
    echo Please right-click and select "Run as Administrator"
    pause
    exit /b 1
)

echo [OK] Running as Administrator
echo.

REM ==========================================
REM Step 1: Check Prerequisites
REM ==========================================
echo [Step 1/7] Checking prerequisites...

REM Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found
echo.
    echo Please install Node.js 20 from: https://nodejs.org/
    echo.
    start https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
echo [OK] Node.js found: %NODE_VERSION%

REM Check npm
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('npm --version') do set NPM_VERSION=%%a
echo [OK] npm found: %NPM_VERSION%

REM Check Git
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Git not found
echo.
    echo Please install Git from: https://git-scm.com/download/win
    start https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [OK] Git found

REM Check Docker
where docker >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARNING] Docker not found
echo.
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    echo.
    choice /C YN /M "Continue without Docker? You'll need to setup database manually"
    if errorlevel 2 exit /b 1
)

echo [OK] Prerequisites check complete
echo.

REM ==========================================
REM Step 2: Create Project Directory
REM ==========================================
echo [Step 2/7] Setting up project directory...

set PROJECT_DIR=C:\meteora_bot

if not exist "%PROJECT_DIR%" (
    mkdir "%PROJECT_DIR%"
    echo [OK] Created directory: %PROJECT_DIR%
) else (
    echo [INFO] Directory already exists: %PROJECT_DIR%
)

cd /d "%PROJECT_DIR%"

REM ==========================================
REM Step 3: Clone Repository (if not exists)
REM ==========================================
echo.
echo [Step 3/7] Checking repository...

if not exist ".git" (
    echo [INFO] Repository not found. Please clone manually:
    echo.
    echo git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git .
    echo.
    echo Or download ZIP from GitHub and extract to %PROJECT_DIR%
    echo.
    start https://github.com/munkdotid/meteora-ai-lp-trading-system
    pause
) else (
    echo [OK] Git repository found
)

if not exist "package.json" (
    echo [ERROR] package.json not found. Repository may not be cloned correctly.
    pause
    exit /b 1
)

echo [OK] Repository check complete
echo.

REM ==========================================
REM Step 4: Create Required Folders
REM ==========================================
echo [Step 4/7] Creating required folders...

if not exist "logs" mkdir "logs"
if not exist "secrets" mkdir "secrets"
if not exist "data" mkdir "data"

REM Set permissions for secrets folder
echo [INFO] Setting permissions for secrets folder...
icacls "secrets" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>&1

echo [OK] Folders created
echo.

REM ==========================================
REM Step 5: Install Dependencies
REM ==========================================
echo [Step 5/7] Installing dependencies...
echo This may take 10-15 minutes...
echo.

call npm install
if %errorLevel% neq 0 (
    echo [WARNING] npm install had issues, retrying with force...
    call npm install --force
)

echo.
echo [OK] Dependencies installed
echo.

REM ==========================================
REM Step 6: Setup Environment
REM ==========================================
echo [Step 6/7] Setting up environment...

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env"
        echo [OK] Created .env from .env.example
        echo.
        echo [IMPORTANT] Please edit .env file with your configuration:
        echo   - Set SOLANA_NETWORK=devnet (for testing)
        echo   - Add your wallet private key or key file path
        echo   - Set DRY_RUN=true for testing
        echo   - Configure database connection
        echo.
        notepad ".env" 2>nul || echo Please manually edit .env file
    ) else (
        echo [WARNING] .env.example not found. Please create .env manually.
    )
) else (
    echo [OK] .env file already exists
)

echo.

REM ==========================================
REM Step 7: Build Application
REM ==========================================
echo [Step 7/7] Building application...

call npm run build
if %errorLevel% neq 0 (
    echo [WARNING] Build had issues. You may need to:
    echo   1. Check TypeScript errors
    echo   2. Run: npm run typecheck
    echo   3. Fix any issues and run: npm run build
    echo.
) else (
    echo [OK] Build successful
)

echo.

REM ==========================================
REM Setup Complete
REM ==========================================
echo ==========================================
echo  Setup Complete!
echo ==========================================
echo.
echo Project directory: %PROJECT_DIR%
echo.
echo Next steps:
echo   1. Edit .env file with your configuration
echo   2. Start Docker Desktop (if installed)
echo   3. Run database: docker-compose up -d postgres redis
echo   4. Test in DRY_RUN mode: npm start
echo   5. Or with hot reload: npm run dev
echo.
echo Useful commands:
echo   cd %PROJECT_DIR%
echo   npm start          - Start application
echo   npm run dev        - Start with hot reload
echo   npm run build      - Build TypeScript
echo   npx prisma studio  - Open database GUI
echo.
echo Documentation:
echo   WINDOWS_DEPLOYMENT_GUIDE.md
echo   QUICKSTART.md
echo   README.md
echo.

choice /C YN /M "Open project in VS Code?"
if errorlevel 1 if not errorlevel 2 code "%PROJECT_DIR%" 2>nul

echo.
pause
