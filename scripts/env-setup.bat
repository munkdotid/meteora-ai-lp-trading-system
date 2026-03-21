@echo off
chcp 65001 >nul

:: Environment Setup Script for Windows
:: This script helps configure the .env file

title Meteora AI LP - Environment Setup

echo ========================================
echo  Meteora AI LP - Environment Setup
echo ========================================
echo.
echo This script will help you configure the .env file
echo.

:: Check if .env exists
if not exist ..\.env.windows.example (
    echo ERROR: .env.windows.example not found!
    echo Please make sure you're running this from the scripts directory.
    pause
    exit /b 1
)

echo [1/5] Creating .env file...
if exist ..\.env (
    echo WARNING: .env already exists!
    set /p overwrite="Do you want to overwrite it? (yes/no): "
    if /I not "!overwrite!"=="yes" (
        echo Skipping .env creation.
        goto :skip_env
    )
)

copy ..\.env.windows.example ..\.env >nul
echo [OK] .env file created.
echo.

:skip_env
echo [2/5] Configuration Options
echo ===========================
echo.
echo Choose your setup:
echo.
echo 1. DEVELOPMENT (Dry Run, Devnet)
echo    - Safe testing mode
echo    - No real transactions
echo    - Use devnet wallet
echo.
echo 2. TESTING (Live on Devnet)
echo    - Real transactions on devnet
echo    - Small amounts only
echo    - For testing trades
echo.
echo 3. PRODUCTION (Mainnet - NOT RECOMMENDED for testing)
echo    - Real transactions on mainnet
echo    - Real money at risk
echo    - Only for experienced users
echo.

set /p mode="Enter choice (1/2/3): "

if "%mode%"=="1" goto :development
if "%mode%"=="2" goto :testing
if "%mode%"=="3" goto :production
goto :invalid_choice

:development
echo.
echo Setting up DEVELOPMENT environment...
(
echo # Development Configuration
echo DRY_RUN=true
echo SOLANA_NETWORK=devnet
echo SOLANA_RPC_URL=https://api.devnet.solana.com
echo LOG_LEVEL=debug
echo TELEGRAM_ENABLED=false
) >> ..\.env.tmp

echo [OK] Development mode configured
echo.
echo IMPORTANT: Get devnet SOL from:
echo https://faucet.solana.com/
echo.
goto :wallet_setup

:testing
echo.
echo Setting up TESTING environment...
(
echo # Testing Configuration (Devnet Live)
echo DRY_RUN=false
echo SOLANA_NETWORK=devnet
echo SOLANA_RPC_URL=https://api.devnet.solana.com
echo LOG_LEVEL=info
echo MAX_POSITIONS=1
echo MAX_POSITION_PERCENTAGE=0.1
echo MIN_POSITION_SIZE_SOL=0.5
echo MAX_POSITION_SIZE_SOL=2
echo TELEGRAM_ENABLED=true
) >> ..\.env.tmp

echo [OK] Testing mode configured
echo.
echo IMPORTANT: This will make REAL transactions on devnet!
echo Make sure your wallet has devnet SOL.
echo.
goto :wallet_setup

:production
echo.
echo ========================================
echo  WARNING: PRODUCTION MODE
echo ========================================
echo.
echo You are about to configure MAINNET trading.
echo This will use REAL MONEY.
echo.
echo Are you ABSOLUTELY SURE you want to continue?
echo.
set /p confirm="Type 'YES' to continue: "
if /I not "!confirm!"=="YES" (
    echo Cancelled.
    goto :end
)

(
echo # Production Configuration (Mainnet)
echo DRY_RUN=false
echo SOLANA_NETWORK=mainnet
echo SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
echo LOG_LEVEL=info
echo MAX_POSITIONS=3
echo MAX_POSITION_PERCENTAGE=0.25
echo MIN_POSITION_SIZE_SOL=0.1
echo MAX_POSITION_SIZE_SOL=5
echo TELEGRAM_ENABLED=true
) >> ..\.env.tmp

echo [OK] Production mode configured
echo.
echo CRITICAL: Verify your configuration before starting!
echo.
goto :wallet_setup

:wallet_setup
echo [3/5] Wallet Configuration
echo ==========================
echo.
echo How do you want to configure your wallet?
echo.
echo 1. I have a private key (base58 format)
echo 2. I have a JSON wallet file
echo 3. Create new wallet (not recommended)
echo 4. Skip for now (I'll edit .env manually)
echo.

set /p wallet_mode="Enter choice (1/2/3/4): "

if "%wallet_mode%"=="1" goto :private_key
if "%wallet_mode%"=="2" goto :json_wallet
if "%wallet_mode%"=="3" goto :create_wallet
if "%wallet_mode%"=="4" goto :skip_wallet
goto :invalid_wallet_choice

:private_key
echo.
echo Enter your wallet private key (base58 format):
echo This will be saved securely in the .env file
echo.
set /p key="Private Key: "
(
echo SOLANA_WALLET_PRIVATE_KEY=!key!
) >> ..\.env.tmp
echo [OK] Private key configured
echo.
goto :telegram_setup

:json_wallet
echo.
echo Place your JSON wallet file in: secrets\wallet.json
echo.
if not exist ..\secrets\wallet.json (
    echo WARNING: secrets\wallet.json not found!
    echo Please create the file first.
)
(
echo WALLET_KEY_PATH=secrets/wallet.json
) >> ..\.env.tmp
echo [OK] JSON wallet configured
echo.
goto :telegram_setup

:create_wallet
echo.
echo Creating new wallet...
echo [TODO: Add wallet generation script]
echo.
echo For now, please create manually and update .env
echo.
goto :telegram_setup

:skip_wallet
echo.
echo Skipping wallet setup.
echo You'll need to edit .env manually and add:
echo   SOLANA_WALLET_PRIVATE_KEY=your_key
echo.
goto :telegram_setup

:telegram_setup
echo [4/5] Telegram Bot (Optional)
echo =============================
echo.
set /p enable_telegram="Enable Telegram notifications? (yes/no): "

if /I "!enable_telegram!"=="yes" (
    echo.
    echo 1. Message @BotFather on Telegram
    echo 2. Create new bot with /newbot
    echo 3. Copy the bot token (format: 123456:ABC-DEF1234...)
    echo.
    set /p bot_token="Enter bot token: "
    set /p chat_id="Enter your chat ID: "
    (
    echo TELEGRAM_ENABLED=true
    echo TELEGRAM_BOT_TOKEN=!bot_token!
    echo TELEGRAM_CHAT_ID=!chat_id!
    ) >> ..\.env.tmp
    echo [OK] Telegram configured
echo.
) else (
    (
    echo TELEGRAM_ENABLED=false
    ) >> ..\.env.tmp
    echo [OK] Telegram disabled
echo.
)

:final_setup
echo [5/5] Finalizing Configuration
echo ================================
echo.

:: Add other default configs
(
echo.
echo # Trading Configuration
echo SCAN_INTERVAL_MINUTES=5
echo REBALANCE_INTERVAL_MINUTES=3
echo MAX_SLIPPAGE_BPS=200
echo DEFAULT_STRATEGY=range
echo.
echo # Database
echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meteora
echo REDIS_URL=redis://localhost:6379
echo.
echo # Security
echo LOG_LEVEL=info
echo LOG_RETENTION_DAYS=30
echo.
echo # Risk Management
echo MAX_DAILY_LOSS_PERCENTAGE=0.05
echo MAX_DRAWDOWN_PERCENTAGE=0.10
echo MIN_VOLUME_USD=50000
echo MIN_TVL_USD=100000
echo MIN_POOL_AGE_HOURS=24
) >> ..\.env.tmp

:: Replace .env with new config
move /Y ..\.env.tmp ..\.env >nul

echo ========================================
echo  Configuration Complete!
echo ========================================
echo.
echo .env file has been created/updated.
echo.
echo Next steps:
echo 1. Review .env file: notepad .\.env
echo 2. Setup database: docker-compose -f docker-compose.dev.yml up -d
echo 3. Install dependencies: npm install
echo 4. Build: npm run build
echo 5. Start: npm start
echo.
echo For development with hot reload: npm run dev
echo.

if "%mode%"=="1" (
    echo You're in DEVELOPMENT mode (safe).
    echo DRY_RUN is enabled - no real transactions.
)
if "%mode%"=="2" (
    echo You're in TESTING mode.
    echo Make sure you have devnet SOL!
)
if "%mode%"=="3" (
    echo You're in PRODUCTION mode.
    echo WARNING: Real money at risk!
)

echo.
pause
goto :end

:invalid_choice
echo.
echo ERROR: Invalid choice!
echo Please run the script again.
pause
exit /b 1

:invalid_wallet_choice
echo.
echo ERROR: Invalid wallet choice!
echo Please run the script again.
pause
exit /b 1

:end
echo.
echo Setup complete! You can close this window.
timeout /t 5 >nul
