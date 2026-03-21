@echo off
chcp 65001 >nul
title Meteora AI LP - Windows Setup
cls

:: ============================================
:: Meteora AI LP Trading System - Windows Starter
:: ============================================

echo.
echo    ╔════════════════════════════════════════════════════════════╗
echo    ║                                                            ║
echo    ║     🤖 METEORA AI LP TRADING SYSTEM - WINDOWS SETUP       ║
echo    ║                                                            ║
echo    ║     Automated Liquidity Provider with AI Intelligence       ║
echo    ║                                                            ║
echo    ╚════════════════════════════════════════════════════════════╝
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Please run this script as Administrator!
    echo    Right-click -^> Run as administrator
    pause
    exit /b 1
)

:: Check if PowerShell is available
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ PowerShell is not installed or not in PATH
    echo    Please install PowerShell from:
    echo    https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows
    pause
    exit /b 1
)

:: Menu
echo    📋 Choose an option:
echo.
echo    [1] 🚀 Quick Start (Recommended for new users)
echo        - Check prerequisites
echo        - Install dependencies
echo        - Set up environment
echo        - Start in DRY-RUN mode (safe testing)
echo.
echo    [2] 📖 Read Documentation
echo        - WINDOWS_QUICKSTART.md (30-minute guide)
echo        - WINDOWS_SETUP.md (complete guide)
echo.
echo    [3] 🔧 Manual Setup
echo        - Run individual scripts
echo        - Advanced configuration
echo.
echo    [4] 🛠️  Management Commands
echo        - Start/Stop/Restart bot
echo        - View logs
echo        - Database management
echo.
echo    [5] ❌ Exit
echo.

set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto :quickstart
if "%choice%"=="2" goto :documentation
if "%choice%"=="3" goto :manual
if "%choice%"=="4" goto :management
if "%choice%"=="5" goto :exit
goto :invalid

:quickstart
echo.
echo 🚀 Starting Quick Setup...
echo.

:: Run Windows setup PowerShell script
powershell -ExecutionPolicy Bypass -File "scripts\setup-windows.ps1" -QuickStart

if %errorlevel% neq 0 (
    echo.
    echo ❌ Setup failed. Please check the error messages above.
    echo    For help, read WINDOWS_TROUBLESHOOTING.md
    pause
    exit /b 1
)

echo.
echo ✅ Setup completed successfully!
echo.
echo 📋 Next steps:
echo    1. Configure environment: scripts\env-setup.bat
    echo    2. Start the bot: scripts\manage.bat start -DryRun
    echo    3. Monitor logs: scripts\manage.bat logs
    echo.
    echo    📖 For detailed guide: WINDOWS_QUICKSTART.md
    echo.
    
    set /p next="Run environment setup now? (Y/N): "
    if /I "%next%"=="Y" (
        call scripts\env-setup.bat
    )
    
    pause
    goto :end

:documentation
echo.
echo 📖 Opening documentation...
echo.

:: Check if files exist
if exist "WINDOWS_QUICKSTART.md" (
    echo ✅ WINDOWS_QUICKSTART.md - 30-minute quick start guide
)
if exist "WINDOWS_SETUP.md" (
    echo ✅ WINDOWS_SETUP.md - Complete setup guide
)
if exist "README.md" (
    echo ✅ README.md - Main project documentation
)

echo.
echo 📂 Opening folder...
start .

echo.
set /p open="Open WINDOWS_QUICKSTART.md? (Y/N): "
if /I "%open%"=="Y" (
    if exist "WINDOWS_QUICKSTART.md" (
        start notepad "WINDOWS_QUICKSTART.md"
    ) else (
        echo ❌ File not found
    )
)

pause
goto :end

:manual
echo.
echo 🔧 Manual Setup Options:
echo.
echo [1] Check prerequisites only
    echo [2] Install dependencies
    echo [3] Set up environment
    echo [4] Build application
    echo [5] Start database (Docker)
    echo [6] Run database migrations
    echo [7] Back to main menu
    echo.
    
    set /p manual="Select option (1-7): "
    
    if "%manual%"=="1" powershell -ExecutionPolicy Bypass -File "scripts\setup-windows.ps1" -CheckPrereqs
    if "%manual%"=="2" npm install
    if "%manual%"=="3" call scripts\env-setup.bat
    if "%manual%"=="4" npm run build
    if "%manual%"=="5" docker-compose -f docker-compose.dev.yml up -d
    if "%manual%"=="6" npx prisma migrate dev
    if "%manual%"=="7" goto :start
    
    pause
    goto :manual

:management
echo.
echo 🛠️  Management Commands:
echo.
echo [1] Start bot (DRY-RUN mode)
    echo [2] Start bot (LIVE mode)
    echo [3] Stop bot
    echo [4] Restart bot
    echo [5] Check status
    echo [6] View logs
    echo [7] Database management
    echo [8] Back to main menu
    echo.
    
    set /p mgmt="Select option (1-8): "
    
    if "%mgmt%"=="1" (
        echo.
        echo 🧪 Starting in DRY-RUN mode (no real transactions)...
        powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" start -DryRun
    )
    if "%mgmt%"=="2" (
        echo.
        echo ⚠️  WARNING: This will start LIVE trading with real money!
        set /p confirm="Type 'LIVE' to confirm: "
        if "!confirm!"=="LIVE" (
            powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" start
        ) else (
            echo Cancelled
        )
    )
    if "%mgmt%"=="3" powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" stop
    if "%mgmt%"=="4" powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" restart
    if "%mgmt%"=="5" powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" status
    if "%mgmt%"=="6" powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" logs
    if "%mgmt%"=="7" powershell -ExecutionPolicy Bypass -File "scripts\manage.ps1" db
    if "%mgmt%"=="8" goto :start
    
    pause
    goto :management

:invalid
echo.
echo ❌ Invalid choice. Please enter 1-5.
echo.
pause
goto :start

:exit
echo.
echo 👋 Goodbye!
echo    For questions or issues:
echo    - Documentation: WINDOWS_QUICKSTART.md
    echo    - Support: https://github.com/munkdotid/meteora-ai-lp-trading-system/issues
    echo.
    timeout /t 2 /nobreak >nul
    exit /b 0

:end
echo.
echo 🎉 Thank you for using Meteora AI LP Trading System!
echo.
pause
