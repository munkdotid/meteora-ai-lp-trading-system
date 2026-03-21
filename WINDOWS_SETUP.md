# Meteora AI LP Trading System - Windows Deployment Guide

Complete guide for deploying on Windows with Ubuntu WSL or directly on Windows.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Troubleshooting](#troubleshooting)
7. [Development Mode](#development-mode)
8. [Production Deployment](#production-deployment)

---

## Quick Start

For experienced users who want to get started immediately:

```powershell
# 1. Clone repository
cd C:\
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git

# 2. Enter directory
cd meteora-ai-lp-trading-system

# 3. Run setup
.\scripts\windows-setup.ps1

# 4. Configure environment
.\scripts\env-setup.ps1

# 5. Start in dry-run mode (safe testing)
.\scripts\manage.ps1 start -DryRun
```

---

## Prerequisites

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | v20.x LTS | [nodejs.org](https://nodejs.org/) |
| **Docker Desktop** | Latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/download/win) |
| **VS Code** (Optional) | Latest | [code.visualstudio.com](https://code.visualstudio.com/) |

### System Requirements

- **OS**: Windows 10/11 (64-bit)
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 10GB free space
- **CPU**: 4 cores recommended

---

## Installation

### Step 1: Install Prerequisites

#### Install Node.js

1. Download from [nodejs.org](https://nodejs.org/)
2. Run installer
3. Verify installation:
   ```powershell
   node --version  # Should show v20.x.x
   npm --version   # Should show 10.x.x
   ```

#### Install Docker Desktop

1. Download from [docker.com](https://www.docker.com/products/docker-desktop)
2. Install with WSL 2 backend (recommended)
3. Start Docker Desktop
4. Verify:
   ```powershell
   docker --version
   docker-compose --version
   ```

#### Install Git

1. Download from [git-scm.com](https://git-scm.com/download/win)
2. Use default settings during install
3. Verify:
   ```powershell
   git --version
   ```

### Step 2: Clone Repository

```powershell
# Navigate to desired location
cd C:\

# Clone repository
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git

# Enter directory
cd meteora-ai-lp-trading-system
```

### Step 3: Run Windows Setup

```powershell
# This will check prerequisites and guide setup
.\scripts\windows-setup.ps1
```

This script will:
- ✅ Check all prerequisites
- ✅ Install dependencies if missing
- ✅ Create necessary directories
- ✅ Set up Git hooks (optional)

### Step 4: Start Database Services

```powershell
# Start PostgreSQL and Redis
docker-compose -f docker-compose.dev.yml up -d

# Verify they're running
docker ps
```

### Step 5: Install Node Dependencies

```powershell
# Install all dependencies
npm install

# Generate Prisma client
npx prisma generate
```

### Step 6: Set Up Database

```powershell
# Run database migrations
npx prisma migrate dev --name init

# Verify with Prisma Studio (optional)
npx prisma studio
```

---

## Configuration

### Interactive Setup (Recommended)

```powershell
# Run interactive environment setup
.\scripts\env-setup.ps1
```

This will guide you through:
1. **Mode selection**: Development / Testing / Production
2. **Wallet configuration**: Private key or JSON file
3. **Telegram setup**: Bot notifications (optional)

### Manual Configuration

If you prefer manual setup:

```powershell
# Copy example environment file
copy .env.windows.example .env

# Edit with your favorite editor
notepad .env
# or
code .env
```

**Critical settings to configure:**

```env
# Wallet (REQUIRED)
SOLANA_WALLET_PRIVATE_KEY=your_private_key_here
# OR
SOLANA_WALLET_KEY_PATH=secrets/wallet.json

# Network (REQUIRED)
SOLANA_NETWORK=devnet  # or mainnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Telegram (OPTIONAL but recommended)
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_AUTHORIZED_USERS=your_chat_id

# Safety settings
DRY_RUN=true  # Set to false for live trading (mainnet only after testing)
```

### Wallet Setup

**Option 1: Using Private Key (not recommended for production)**
```powershell
# Edit .env
SOLANA_WALLET_PRIVATE_KEY=base58_encoded_private_key
```

**Option 2: Using JSON Wallet File (recommended)**
```powershell
# 1. Create secrets directory
mkdir secrets

# 2. Place your wallet.json file there
# File format: [64,123,45,...] (array of bytes)

# 3. Update .env
SOLANA_WALLET_KEY_PATH=secrets/wallet.json
```

**Security Note:**
- Never commit .env or secrets/ to git
- .gitignore already excludes these
- Set file permissions: `.env` should be readable only by you

---

## Running the Application

### Development Mode (Recommended for Testing)

```powershell
# Start with hot reload
.\scripts\manage.ps1 start -Dev

# Or manually:
npm run dev
```

### Dry Run Mode (Safe Testing - No Real Transactions)

```powershell
# Test without making real transactions
.\scripts\manage.ps1 start -DryRun

# Or manually:
$env:DRY_RUN="true"
npm start
```

**What Dry Run does:**
- ✅ Simulates all trading logic
- ✅ Logs what would be executed
- ✅ Tests AI decision making
- ✅ Validates configurations
- ❌ No real transactions
- ❌ No real money at risk

### Production Mode

```powershell
# After thorough testing, start production
.\scripts\manage.ps1 start

# Or manually:
npm start
```

⚠️ **WARNING**: This will use real money on mainnet!
- Make sure you've tested extensively on devnet
- Start with small amounts
- Monitor closely

---

## Management Commands

### Using the Management Script

```powershell
# Check status
.\scripts\manage.ps1 status

# Start bot
.\scripts\manage.ps1 start

# Stop bot
.\scripts\manage.ps1 stop

# Restart bot
.\scripts\manage.ps1 restart

# View logs
.\scripts\manage.ps1 logs

# Database management
.\scripts\manage.ps1 db

# Prisma commands
.\scripts\manage.ps1 prisma

# Clean project
.\scripts\manage.ps1 clean

# Update from git
.\scripts\manage.ps1 update
```

### Manual Commands

```powershell
# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Database
npx prisma migrate dev
npx prisma generate
npx prisma studio

# Docker
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
```

---

## Development Mode

### Features

- **Hot Reload**: Automatically restart on code changes
- **Dry Run**: No real transactions
- **Debug Logging**: Detailed logs for troubleshooting
- **Prisma Studio**: Visual database management

### Start Development Environment

```powershell
# 1. Start database
docker-compose -f docker-compose.dev.yml up -d

# 2. Configure for development
.\scripts\env-setup.ps1
# Choose: 1. DEVELOPMENT (Dry Run, Devnet)

# 3. Start in dev mode
npm run dev
```

### Access Development Tools

| Tool | URL | Description |
|------|-----|-------------|
| Prisma Studio | http://localhost:5555 | Database GUI |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |
| pgAdmin | http://localhost:5050 | Database admin |
| Redis Commander | http://localhost:8081 | Redis GUI |

To start with GUI tools:
```powershell
docker-compose -f docker-compose.dev.yml --profile gui up -d
```

---

## Production Deployment

### Pre-deployment Checklist

- [ ] Extensive testing on devnet (minimum 1 week)
- [ ] Small live test on mainnet (minimum 3 days)
- [ ] Telegram notifications configured and tested
- [ ] Database backups configured
- [ ] Log rotation configured
- [ ] Security audit completed
- [ ] Emergency procedures documented

### Deployment Steps

```powershell
# 1. Build for production
npm run build

# 2. Configure for production
# Edit .env:
#   DRY_RUN=false
#   SOLANA_NETWORK=mainnet
#   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# 3. Test configuration
npm run config:check

# 4. Start production
npm start

# 5. Monitor logs
Get-Content logs\app.log -Wait -Tail 50
```

### Recommended VPS Providers

| Provider | Instance | Monthly Cost |
|----------|----------|--------------|
| DigitalOcean | 2 vCPU / 4GB RAM | $24 |
| Vultr | 2 vCPU / 4GB RAM | $20 |
| AWS Lightsail | 2 vCPU / 4GB RAM | $20 |
| Hetzner | 2 vCPU / 4GB RAM | €8 |

See `UBUNTU_SETUP.md` for detailed VPS deployment guide.

---

## Troubleshooting

### Docker Issues

**Problem**: Docker daemon not running
```powershell
# Solution: Start Docker Desktop
docker-desktop

# Or from PowerShell:
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

**Problem**: Port already in use
```powershell
# Check what's using port 5432
netstat -ano | findstr :5432

# Kill process (if safe)
taskkill /PID <PID> /F
```

### Node.js Issues

**Problem**: npm install fails
```powershell
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
Remove-Item -Recurse -Force node_modules
npm install
```

**Problem**: Out of memory during build
```powershell
# Increase Node memory limit
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

### Database Issues

**Problem**: Can't connect to PostgreSQL
```powershell
# Check if container is running
docker ps | findstr postgres

# Check logs
docker logs meteora-postgres-dev

# Reset database (WARNING: data loss)
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

### Solana Connection Issues

**Problem**: RPC connection failed
```powershell
# Test RPC connection
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1, "method":"getHealth"}'

# Try alternative RPC endpoints:
# - https://api.devnet.solana.com
# - https://devnet.helius-rpc.com/?api-key=YOUR_KEY
# - https://solana-devnet.g.alchemy.com/v2/YOUR_KEY
```

### Telegram Issues

**Problem**: Bot not responding
```powershell
# 1. Verify bot token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# 2. Check webhook (if using webhook mode)
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

---

## Monitoring

### View Logs

```powershell
# Real-time logs
Get-Content logs\app.log -Wait -Tail 50

# Or using management script
.\scripts\manage.ps1 logs

# Search for errors
Select-String -Path logs\app.log -Pattern "ERROR"
```

### System Resources

```powershell
# Check CPU/Memory
Get-Process -Name "node" | Select-Object Name, Id, CPU, WorkingSet

# Check disk space
Get-Volume | Select-Object DriveLetter, SizeRemaining, Size
```

### Telegram Commands

Once connected, use Telegram bot:
```
/status    - Check bot status
/pnl       - View profit/loss
/positions - List active positions
/stop      - Stop the bot
/help      - Show all commands
```

---

## Security Best Practices

### On Windows

1. **File Permissions**
   ```powershell
   # Set .env to be readable only by current user
   $path = ".env"
   $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
   
   $acl = Get-Acl $path
   $acl.SetAccessRuleProtection($true, $false)
   
   # Remove all access
   $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
   
   # Add current user only
   $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "Read", "Allow")
   $acl.SetAccessRule($rule)
   Set-Acl $path $acl
   ```

2. **Secure Storage**
   - Use Windows Credential Manager
   - Or Windows Subsystem for Linux (WSL) with encrypted home

3. **Firewall**
   ```powershell
   # Check Windows Firewall
   Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*ssh*" -or $_.DisplayName -like "*docker*" }
   
   # Only open necessary ports
   ```

### Wallet Security

- Never store private keys in plain text (use secrets/)
- Use hardware wallet if possible
- Enable 2FA on all accounts
- Regular security audits

---

## Advanced Topics

### Using WSL2 (Windows Subsystem for Linux)

For better Linux compatibility:

```powershell
# 1. Install WSL2
wsl --install -d Ubuntu-22.04

# 2. Follow Ubuntu deployment guide
# See UBUNTU_SETUP.md for details

# 3. Access Windows files from WSL
cd /mnt/c/meteora-ai-lp-trading-system
```

### Performance Tuning

```powershell
# Increase Node memory for large operations
$env:NODE_OPTIONS="--max-old-space-size=8192"

# Enable garbage collection logging
$env:NODE_OPTIONS="--trace-gc --trace-gc-verbose"
```

### Backup and Restore

```powershell
# Backup database
docker exec meteora-postgres-dev pg_dump -U postgres meteora > backup_$(Get-Date -Format "yyyyMMdd").sql

# Restore database
cat backup_20250321.sql | docker exec -i meteora-postgres-dev psql -U postgres
```

---

## Support

### Getting Help

1. **Check Documentation**
   - `README.md` - Main documentation
   - `TROUBLESHOOTING.md` - Common issues
   - `API.md` - API reference

2. **Check Logs**
   ```powershell
   Get-Content logs\app.log -Wait -Tail 100
   ```

3. **Telegram Community**
   - Join: https://t.me/meteora_trading

4. **GitHub Issues**
   - https://github.com/munkdotid/meteora-ai-lp-trading-system/issues

### Reporting Bugs

Include:
- Windows version: `winver`
- Node version: `node --version`
- Error messages from logs
- Steps to reproduce

---

## License

See [LICENSE](../LICENSE) file for details.

---

## Disclaimer

⚠️ **WARNING**: Trading cryptocurrencies involves significant risk. This bot trades with real money and can result in substantial losses. Always:

- Test thoroughly in dry-run mode first
- Start with small amounts
- Never risk more than you can afford to lose
- Monitor the bot closely, especially initially
- Have emergency procedures in place

**Use at your own risk.**
