# ==========================================
# Environment Setup Script for Windows
# Interactive configuration of .env file
# ==========================================

param(
    [switch]$Silent,
    [string]$Mode = ""
)

# Colors
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"
$Red = "Red"

function Write-Status($message, $status = "INFO") {
    $timestamp = Get-Date -Format "HH:mm:ss"
    switch ($status) {
        "OK" { Write-Host "[$timestamp] [OK] $message" -ForegroundColor $Green }
        "ERROR" { Write-Host "[$timestamp] [ERROR] $message" -ForegroundColor $Red }
        "WARNING" { Write-Host "[$timestamp] [WARNING] $message" -ForegroundColor $Yellow }
        default { Write-Host "[$timestamp] [INFO] $message" -ForegroundColor $Cyan }
    }
}

function Show-Header() {
    Clear-Host
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host "  Meteora AI LP - Environment Setup" -ForegroundColor $Cyan
    Write-Host "========================================" -ForegroundColor $Cyan
    Write-Host ""
}

function Get-EnvPath() {
    return Join-Path $PSScriptRoot ".." ".env"
}

function Get-TemplatePath() {
    return Join-Path $PSScriptRoot ".." ".env.windows.example"
}

# ==========================================
# Main Script
# ==========================================

Show-Header

$envPath = Get-EnvPath
$templatePath = Get-TemplatePath

# Check template exists
if (-not (Test-Path $templatePath)) {
    Write-Status "Template file not found: $templatePath" "ERROR"
    exit 1
}

# Check if .env exists
if (Test-Path $envPath) {
    Write-Status ".env file already exists" "WARNING"
    if (-not $Silent) {
        $overwrite = Read-Host "Do you want to overwrite it? (yes/no)"
        if ($overwrite -ne "yes") {
            Write-Status "Setup cancelled"
            exit 0
        }
    }
}

# Copy template
copy $templatePath $envPath
Write-Status "Created .env from template" "OK"

# Mode selection
if (-not $Mode) {
    Show-Header
    Write-Host "Select setup mode:" -ForegroundColor $Cyan
    Write-Host ""
    Write-Host "1. DEVELOPMENT (Dry Run, Devnet)" -ForegroundColor $Green
    Write-Host "   Safe testing mode, no real transactions" -ForegroundColor $Yellow
    Write-Host ""
    Write-Host "2. TESTING (Live on Devnet)" -ForegroundColor $Yellow
    Write-Host "   Real transactions on devnet, small amounts" -ForegroundColor $Yellow
    Write-Host ""
    Write-Host "3. PRODUCTION (Mainnet)" -ForegroundColor $Red
    Write-Host "   Real money at risk!" -ForegroundColor $Red
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1/2/3)"
} else {
    $choice = $Mode
}

# Configure based on mode
switch ($choice) {
    "1" {
        Write-Status "Configuring DEVELOPMENT mode" "OK"
        (Get-Content $envPath) `
            -replace "DRY_RUN=false", "DRY_RUN=true" `
            -replace "SOLANA_NETWORK=mainnet", "SOLANA_NETWORK=devnet" `
            -replace "SOLANA_RPC_URL=https://api.mainnet-beta.solana.com", "SOLANA_RPC_URL=https://api.devnet.solana.com" | 
            Set-Content $envPath
        
        Write-Status "Development mode configured" "OK"
        Write-Host ""
        Write-Host "IMPORTANT: Get devnet SOL from:" -ForegroundColor $Yellow
        Write-Host "https://faucet.solana.com/" -ForegroundColor $Cyan
    }
    "2" {
        Write-Status "Configuring TESTING mode (Devnet Live)" "OK"
        (Get-Content $envPath) `
            -replace "DRY_RUN=true", "DRY_RUN=false" `
            -replace "SOLANA_NETWORK=mainnet", "SOLANA_NETWORK=devnet" `
            -replace "SOLANA_RPC_URL=https://api.mainnet-beta.solana.com", "SOLANA_RPC_URL=https://api.devnet.solana.com" `
            -replace "MAX_POSITIONS=5", "MAX_POSITIONS=1" `
            -replace "MAX_POSITION_PERCENTAGE=0.25", "MAX_POSITION_PERCENTAGE=0.1" | 
            Set-Content $envPath
        
        Write-Status "Testing mode configured" "OK"
        Write-Host ""
        Write-Host "IMPORTANT: This will make REAL transactions on devnet!" -ForegroundColor $Yellow
        Write-Host "Make sure your wallet has devnet SOL." -ForegroundColor $Yellow
    }
    "3" {
        Write-Host ""
        Write-Host "WARNING: You are configuring PRODUCTION mode!" -ForegroundColor $Red
        Write-Host "This will use REAL MONEY on mainnet." -ForegroundColor $Red
        Write-Host ""
        $confirm = Read-Host "Type 'YES' to continue"
        
        if ($confirm -eq "YES") {
            Write-Status "Configuring PRODUCTION mode" "OK"
            (Get-Content $envPath) `
                -replace "DRY_RUN=true", "DRY_RUN=false" | 
                Set-Content $envPath
            
            Write-Status "Production mode configured" "OK"
            Write-Host ""
            Write-Host "CRITICAL: Verify your configuration before starting!" -ForegroundColor $Red
        } else {
            Write-Status "Cancelled"
            exit 0
        }
    }
    default {
        Write-Status "Invalid choice" "ERROR"
        exit 1
    }
}

# Wallet configuration
Write-Host ""
Write-Status "Wallet Configuration" "INFO"
Write-Host ""
Write-Host "How do you want to configure your wallet?" -ForegroundColor $Cyan
Write-Host "1. Private key (base58)" -ForegroundColor $Yellow
Write-Host "2. JSON wallet file" -ForegroundColor $Yellow
Write-Host "3. Skip (configure manually later)" -ForegroundColor $Yellow
Write-Host ""

$walletChoice = Read-Host "Enter choice (1/2/3)"

switch ($walletChoice) {
    "1" {
        $key = Read-Host "Enter your private key (input will be hidden)" -AsSecureString
        $plainKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))
        (Get-Content $envPath) -replace "SOLANA_WALLET_PRIVATE_KEY=", "SOLANA_WALLET_PRIVATE_KEY=$plainKey" | Set-Content $envPath
        Write-Status "Private key configured" "OK"
        # Clear sensitive data from memory
        $plainKey = $null
    }
    "2" {
        $secretsPath = Join-Path $PSScriptRoot ".." "secrets"
        if (-not (Test-Path $secretsPath)) {
            New-Item -ItemType Directory -Path $secretsPath -Force | Out-Null
        }
        Write-Host ""
        Write-Host "Please place your wallet JSON file at:" -ForegroundColor $Yellow
        Write-Host "$secretsPath\wallet.json" -ForegroundColor $Cyan
        Write-Host ""
        (Get-Content $envPath) -replace "SOLANA_WALLET_KEY_PATH=.*", "SOLANA_WALLET_KEY_PATH=secrets/wallet.json" | Set-Content $envPath
        Write-Status "JSON wallet path configured" "OK"
    }
    "3" {
        Write-Status "Skipping wallet setup" "INFO"
        Write-Host "You'll need to edit .env manually" -ForegroundColor $Yellow
    }
}

# Telegram configuration
Write-Host ""
$telegram = Read-Host "Enable Telegram notifications? (yes/no)"
if ($telegram -eq "yes") {
    Write-Host ""
    Write-Host "1. Message @BotFather on Telegram" -ForegroundColor $Cyan
    Write-Host "2. Create new bot with /newbot" -ForegroundColor $Cyan
    Write-Host "3. Copy the bot token" -ForegroundColor $Cyan
    Write-Host ""
    $token = Read-Host "Enter bot token"
    $chatId = Read-Host "Enter your chat ID (get from @userinfobot)"
    
    (Get-Content $envPath) `
        -replace "TELEGRAM_ENABLED=false", "TELEGRAM_ENABLED=true" `
        -replace "TELEGRAM_BOT_TOKEN=.*", "TELEGRAM_BOT_TOKEN=$token" `
        -replace "TELEGRAM_AUTHORIZED_USERS=.*", "TELEGRAM_AUTHORIZED_USERS=$chatId" | 
        Set-Content $envPath
    
    Write-Status "Telegram configured" "OK"
} else {
    Write-Status "Telegram disabled" "INFO"
}

# Final message
Show-Header
Write-Status "Configuration Complete!" "OK"
Write-Host ""
Write-Host ".env file has been configured at:" -ForegroundColor $Cyan
Write-Host $envPath -ForegroundColor $Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor $Cyan
Write-Host "1. Review .env file" -ForegroundColor $Yellow
Write-Host "2. Start Docker: docker-compose -f docker-compose.dev.yml up -d" -ForegroundColor $Yellow
Write-Host "3. Install: npm install" -ForegroundColor $Yellow
Write-Host "4. Build: npm run build" -ForegroundColor $Yellow
Write-Host "5. Start: npm start" -ForegroundColor $Yellow
Write-Host ""

if ($choice -eq "1") {
    Write-Host "You're in DEVELOPMENT mode (safe)." -ForegroundColor $Green
    Write-Host "DRY_RUN is enabled - no real transactions." -ForegroundColor $Green
}

Read-Host "Press Enter to exit"
