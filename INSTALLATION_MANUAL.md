# 📘 COMPLETE INSTALLATION MANUAL
# AI LP Trading System for Meteora DLMM

**Version:** 1.0  
**Last Updated:** 2026-03-21  
**Target OS:** Ubuntu 22.04 LTS (Jammy Jellyfish)  
**Estimated Time:** 45-60 minutes  
**Difficulty:** Intermediate

---

## 📋 TABLE OF CONTENTS

1. [Pre-Installation Checklist](#1-pre-installation-checklist)
2. [Server Requirements](#2-server-requirements)
3. [Step 1: Server Setup](#3-step-1-server-setup)
4. [Step 2: Install Dependencies](#4-step-2-install-dependencies)
5. [Step 3: Clone Repository](#5-step-3-clone-repository)
6. [Step 4: Configure Environment](#6-step-4-configure-environment)
7. [Step 5: Database Setup](#7-step-5-database-setup)
8. [Step 6: Build Application](#8-step-6-build-application)
9. [Step 7: Security Hardening](#9-step-7-security-hardening)
10. [Step 8: Start Services](#10-step-8-start-services)
11. [Step 9: Testing Procedures](#11-step-9-testing-procedures)
12. [Step 10: Production Deployment](#12-step-10-production-deployment)
13. [Troubleshooting](#13-troubleshooting)
14. [Maintenance](#14-maintenance)

---

## 1. PRE-INSTALLATION CHECKLIST

### ✅ Prerequisites Checklist

Before starting, ensure you have:

- [ ] **VPS/Server** with Ubuntu 22.04 LTS
- [ ] **SSH Access** with root or sudo privileges
- [ ] **GitHub Repository Access** (munkdotid/meteora-ai-lp-trading-system)
- [ ] **GitHub Personal Access Token** (for private repo)
- [ ] **Solana Wallet** with private key (for testing)
- [ ] **Telegram Bot Token** (optional, for notifications)
- [ ] **Domain Name** (optional, for HTTPS)
- [ ] **SSL Certificate** (optional, Let's Encrypt)

### 📝 Information to Prepare

| Item | Example | Where to Get |
|------|---------|--------------|
| Server IP | `192.168.1.100` | VPS provider |
| SSH Key | `~/.ssh/id_rsa` | Local machine |
| GitHub Token | `ghp_xxxxxxxx` | GitHub Settings > Developer Settings |
| Solana RPC | `https://api.mainnet-beta.solana.com` | Solana or QuickNode |
| Wallet Private Key | Base58 string | Phantom/Solflare export |
| Telegram Token | `123456:ABC-DEF` | @BotFather |
| Jupiter API | `https://quote-api.jup.ag/v6` | Jupiter Docs |

---

## 2. SERVER REQUIREMENTS

### 🖥️ Minimum Requirements

```
CPU:     2 cores (Intel/AMD x86_64)
RAM:     4 GB
Storage: 50 GB SSD
Network: 100 Mbps unmetered
OS:      Ubuntu 22.04 LTS
```

### 🖥️ Recommended Requirements

```
CPU:     4 cores
RAM:     8 GB
Storage: 100 GB SSD
Network: 1 Gbps unmetered
OS:      Ubuntu 22.04 LTS
Location: US East (low latency to Solana validators)
```

### 🌐 Recommended VPS Providers

| Provider | Instance | Price/Month | Link |
|----------|----------|-------------|------|
| **DigitalOcean** | Droplet 4GB | $24 | digitalocean.com |
| **AWS** | t3.medium | $30+ | aws.amazon.com |
| **Hetzner** | CPX21 | €12 | hetzner.com |
| **Vultr** | 4GB Cloud | $24 | vultr.com |

---

## 3. STEP 1: SERVER SETUP

### 3.1 Connect to Server

**Option A: Using SSH Key (Recommended)**
```bash
# From your local machine
ssh -i ~/.ssh/your_key root@YOUR_SERVER_IP
```

**Option B: Using Password**
```bash
ssh root@YOUR_SERVER_IP
# Enter password when prompted
```

### 3.2 Update System

```bash
# Update package list
sudo apt update

# Upgrade all packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    net-tools \
    ufw \
    fail2ban \
    chrony

# Set timezone to UTC (recommended for trading)
sudo timedatectl set-timezone UTC

# Verify
date
```

### 3.3 Create Trading User

```bash
# Create dedicated user (don't run as root!)
sudo useradd -m -s /bin/bash meteora

# Add to sudo group
sudo usermod -aG sudo meteora

# Set password
sudo passwd meteora
# Enter strong password twice

# Switch to new user
su - meteora

# Verify
whoami
# Should show: meteora
```

### 3.4 Configure SSH (Security)

```bash
# As root or with sudo
sudo nano /etc/ssh/sshd_config
```

**Make these changes:**
```conf
# Disable root login
PermitRootLogin no

# Disable password authentication (use keys only)
PasswordAuthentication no

# Change default port (optional but recommended)
Port 2222

# Allow only specific user
AllowUsers meteora
```

**Restart SSH:**
```bash
sudo systemctl restart sshd

# Test new connection in NEW terminal before closing current!
ssh -p 2222 -i ~/.ssh/your_key meteora@YOUR_SERVER_IP
```

---

## 4. STEP 2: INSTALL DEPENDENCIES

### 4.1 Install Docker & Docker Compose

```bash
# Remove old versions
sudo apt remove docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt install -y \
    ca-certificates \
    gnupg \
    lsb-release

# Add Docker GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update and install
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Apply group change (logout and login, or use):
newgrp docker

# Verify
docker --version
# Should show: Docker version 24.x.x

docker compose version
# Should show: Docker Compose version v2.x.x
```

### 4.2 Install Node.js via NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc

# Install Node.js 20 (LTS)
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version
# Should show: v20.x.x

npm --version
# Should show: 10.x.x
```

### 4.3 Install PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Verify
pm2 --version
# Should show: 5.x.x

# Setup PM2 startup script
pm2 startup systemd

# Follow the output and run the command shown
# Example:
sudo env PATH=$PATH:/home/meteora/.nvm/versions/node/v20.x.x/bin /home/meteora/.nvm/versions/node/v20.x.x/lib/node_modules/pm2/bin/pm2 startup systemd -u meteora --hp /home/meteora
```

### 4.4 Install Additional Tools

```bash
# Install build tools
sudo apt install -y build-essential python3 make g++

# Install process monitoring
sudo apt install -y sysstat iotop nethogs

# Enable system monitoring
sudo systemctl enable sysstat
sudo systemctl start sysstat
```

---

## 5. STEP 3: CLONE REPOSITORY

### 5.1 Create Application Directory

```bash
# Create directory
sudo mkdir -p /opt/meteora-ai-lp
sudo chown meteora:meteora /opt/meteora-ai-lp

# Navigate
cd /opt/meteora-ai-lp
```

### 5.2 Clone from GitHub

**Option A: HTTPS (requires token for private repo)**
```bash
# Clone using token
git clone https://YOUR_GITHUB_TOKEN@github.com/munkdotid/meteora-ai-lp-trading-system.git .

# Example:
# git clone https://ghp_xxxxxxxx@github.com/munkdotid/meteora-ai-lp-trading-system.git .
```

**Option B: SSH (if SSH key configured)**
```bash
# Generate SSH key first (if not exists)
#ssh-keygen -t ed25519 -C "meteora@yourdomain.com"
ssh-keygen -t ed25519 -C "meteora@172.21.213.139"

# Copy public key to GitHub
cat ~/.ssh/id_ed25519.pub
# Copy output to: GitHub > Settings > SSH and GPG keys > New SSH key

# Clone
git clone git@github.com:munkdotid/meteora-ai-lp-trading-system.git .
```

**Option C: Download ZIP (not recommended)**
```bash
# Only if other methods fail
curl -L -o master.zip https://github.com/munkdotid/meteora-ai-lp-trading-system/archive/refs/heads/master.zip
unzip master.zip
mv meteora-ai-lp-trading-system-master/* .
rm -rf master.zip meteora-ai-lp-trading-system-master
```

### 5.3 Verify Clone

```bash
# Check files exist
ls -la

# Should see:
# - src/
# - scripts/
# - prisma/
# - docker-compose.yml
# - package.json
# - README.md

# Check git status
git status
# Should show: On branch main
```

---

## 6. STEP 4: CONFIGURE ENVIRONMENT

### 6.1 Copy Environment Template

```bash
# Create .env file
cp .env.example .env

# Edit with your settings
nano .env
```

### 6.2 Required Configuration

**Minimum Required Settings:**
```bash
# ==========================================
# REQUIRED - Must fill these
# ==========================================

# Solana RPC (use dedicated node for production!)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Wallet (choose ONE method)
# Method 1: Direct private key (convenient but less secure)
SOLANA_WALLET_PRIVATE_KEY=your_base58_private_key_here

# Method 2: Key file (more secure)
# WALLET_KEY_PATH=/opt/meteora-ai-lp/secrets/wallet.json

# Database
DATABASE_URL="postgresql://postgres:your_secure_password@localhost:5432/meteora_trading?schema=public"

# Redis
REDIS_URL=redis://localhost:6379

# Trading Mode (REQUIRED for testing!)
DRY_RUN=true  # Set to true for testing

# Risk Management
MAX_POSITIONS=3
MAX_POSITION_PERCENTAGE=0.25
MIN_POOL_TVL_USD=500000
```

### 6.3 Optional Configuration

**Telegram Notifications:**
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_IDS=123456789,987654321
```

**Advanced Settings:**
```bash
# Rebalancing
REBALANCE_CHECK_INTERVAL_MS=180000
OUT_OF_RANGE_THRESHOLD=0.10

# AI
MIN_AI_CONFIDENCE=0.75

# Logging
LOG_LEVEL=info
LOG_MAX_SIZE=100m
LOG_MAX_FILES=14d
```

### 6.4 Create Secrets Directory

```bash
# Create secrets directory
mkdir -p secrets

# If using key file method, save wallet
# nano secrets/wallet.json
# Paste: [12,34,56,...] (byte array format)

# Set permissions
chmod 700 secrets
chmod 600 secrets/* 2>/dev/null || true
```

### 6.5 Validate Configuration

```bash
# Run validation script
npm run validate:env

# Or check manually
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const required = ['SOLANA_RPC_URL', 'DATABASE_URL', 'REDIS_URL'];
const missing = required.filter(k => !env.includes(k + '='));
if (missing.length > 0) {
  console.error('Missing:', missing);
  process.exit(1);
}
console.log('✅ All required env vars present');
"
```

---

## 7. STEP 5: DATABASE SETUP

### 7.1 Start Infrastructure Services

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Wait for services to be ready
sleep 10

# Check status
docker compose ps

# Should show:
# postgres   running   Up 10 seconds
# redis      running   Up 10 seconds
```

### 7.2 Initialize Database

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Verify tables created
docker compose exec postgres psql -U postgres -d meteora_trading -c "\dt"

# Should show 10 tables:
# Pool, Position, Trade, PoolSnapshot, AIDecision,
# Performance, SystemState, AuditLog, TelegramSession, Notification
```

### 7.3 Test Database Connection

```bash
# Run test connection
npm run db:test

# Or manually:
npx prisma db pull --print
```

---

## 8. STEP 6: BUILD APPLICATION

### 8.1 Install Dependencies

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Verify install
ls node_modules | wc -l
# Should show ~500+ packages
```

### 8.2 Compile TypeScript

```bash
# Build application
npm run build

# Verify build
ls -la dist/

# Should show:
# - index.js
# - agents/
# - services/
# - config/
# - types/
# - utils/
```

### 8.3 Run Type Checking

```bash
# Check for TypeScript errors
npm run typecheck

# Should show: error TS0: No errors
```

---

## 9. STEP 7: SECURITY HARDENING

### 9.1 Set File Permissions

```bash
# Set .env permissions
chmod 600 .env

# Set secrets permissions
chmod 700 secrets
chmod 600 secrets/* 2>/dev/null || true

# Set log directory permissions
mkdir -p logs
chmod 755 logs

# Set scripts permissions
chmod +x scripts/*.sh

# Verify
ls -la
# -rw------- 1 meteora meteora  2345 .env
# drwx------ 2 meteora meteora  4096 secrets
```

### 9.2 Configure Firewall

```bash
# Check UFW status
sudo ufw status

# If inactive, enable:
sudo ufw allow 2222/tcp    # SSH (custom port)
sudo ufw allow 80/tcp      # HTTP (if using web)
sudo ufw allow 443/tcp     # HTTPS (if using SSL)
sudo ufw allow 3000/tcp    # API (if exposing)
sudo ufw enable

# Verify
sudo ufw status verbose
```

### 9.3 Setup Log Rotation

```bash
# Install logrotate (usually pre-installed)
sudo apt install -y logrotate

# Create logrotate config
sudo tee /etc/logrotate.d/meteora-ai-lp << 'EOF'
/opt/meteora-ai-lp/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 meteora meteora
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Test logrotate
sudo logrotate -d /etc/logrotate.d/meteora-ai-lp
```

### 9.4 Setup Fail2ban (Brute Force Protection)

```bash
# Configure fail2ban
sudo tee /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

# Restart fail2ban
sudo systemctl restart fail2ban

# Check status
sudo fail2ban-client status
```

---

## 10. STEP 8: START SERVICES

### 10.1 Run Database Services

```bash
# Ensure PostgreSQL and Redis running
docker compose up -d postgres redis

# Verify
docker compose ps
```

### 10.2 Test DRY_RUN Mode (CRITICAL!)

```bash
# MUST test in dry run first!
DRY_RUN=true npm start

# Or using pm2:
DRY_RUN=true pm2 start ecosystem.config.js

# Watch logs
tail -f logs/app.log
```

**Expected Output:**
```
[2026-03-21T10:00:00.000Z] [INFO] [System] 🚀 AI LP Trading Bot Started
[2026-03-21T10:00:00.000Z] [INFO] [System] 🔒 DRY RUN MODE - No real transactions
[2026-03-21T10:00:00.000Z] [INFO] [Wallet] ✅ Wallet initialized: 7xd...
[2026-03-21T10:00:00.000Z] [INFO] [Scout] 🔍 Scanning 50 pools...
[2026-03-21T10:00:03.000Z] [INFO] [Scout] 🏆 Top opportunity: SOL-USDC (Score: 85)
[2026-03-21T10:00:03.000Z] [INFO] [TradingEngine] 📊 Evaluating entry...
[2026-03-21T10:00:03.000Z] [INFO] [TradingEngine] 💡 DRY RUN: Would enter SOL-USDC
```

### 10.3 Run Health Check

```bash
# Run health check script
./scripts/health-check.sh

# Or manually check:
pm run health-check
```

**Expected Output:**
```
=== Meteora AI LP Health Check ===
Timestamp: 2026-03-21T10:00:00Z
Status: ✅ HEALTHY

Database: ✅ Connected (14ms)
Redis: ✅ Connected (2ms)
Solana RPC: ✅ Responsive (45ms)
Wallet: ✅ Valid (Balance: 10.5 SOL)
Memory: ✅ 45% used (3.2GB / 8GB)
Disk: ✅ 12% used (12GB / 100GB)
```

### 10.4 Monitor for 5 Minutes

```bash
# Keep monitoring logs
tail -f logs/app.log | grep -E "(ERROR|WARN|Entry|Exit|Rebalance)"

# In another terminal, check system resources
htop

# Check for errors
pm2 logs --lines 100
```

---

## 11. STEP 9: TESTING PROCEDURES

### 11.1 Phase 1: DRY_RUN Testing (1-2 hours)

**Goal:** Verify system works without real trades

```bash
# Start with dry run
DRY_RUN=true pm2 start ecosystem.config.js --name "meteora-test"

# Monitor for 1-2 hours
# Watch for:
# - Successful pool scanning
# - AI analysis running
# - Position evaluations (DRY RUN)
# - No errors in logs
```

**Checklist:**
- [ ] Scout scans pools every 3 minutes
- [ ] Analyst scores opportunities
- [ ] Risk manager validates trades
- [ ] Trading engine evaluates entries
- [ ] No database errors
- [ ] No Redis errors
- [ ] Memory usage stable (< 70%)

### 11.2 Phase 2: Small Live Test (1 day)

**Goal:** Test with real money (minimal amount)

```bash
# Prepare small amount for testing (0.5-1 SOL)
# Ensure wallet has: 1 SOL minimum

# Disable dry run
# Edit .env: DRY_RUN=false
nano .env

# Set very conservative limits
MAX_POSITIONS=1
MAX_POSITION_PERCENTAGE=0.10
MIN_POOL_TVL_USD=1000000
MIN_AI_CONFIDENCE=0.85

# Restart
pm2 restart meteora-test
```

**Watch closely:**
```bash
# Monitor every transaction
tail -f logs/app.log | grep -E "(Transaction|Entry|Exit|PnL|ERROR)"

# Check wallet balance
curl -s "https://api.mainnet-beta.solana.com" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"YOUR_WALLET_ADDRESS\"]}"
```

### 11.3 Phase 3: Production Testing (1 week)

**Goal:** Gradual scale up

```bash
# Day 1-2: 1 position, 10% max
MAX_POSITIONS=1
MAX_POSITION_PERCENTAGE=0.10

# Day 3-4: 2 positions, 15% max
MAX_POSITIONS=2
MAX_POSITION_PERCENTAGE=0.15

# Day 5-7: 3 positions, 20% max
MAX_POSITIONS=3
MAX_POSITION_PERCENTAGE=0.20

# After 1 week, full settings
MAX_POSITIONS=5
MAX_POSITION_PERCENTAGE=0.25
```

### 11.4 Testing Checklist

| Test | Expected Result | Pass/Fail |
|------|-----------------|-----------|
| Scout finds pools | Lists top 50 pools | [ ] |
| AI analyzes | Returns score 0-100 | [ ] |
| Risk check | Validates limits | [ ] |
| Entry position | Creates position record | [ ] |
| Monitor position | Updates every 30s | [ ] |
| Rebalance | Shifts when out of range | [ ] |
| Exit position | Closes with PnL | [ ] |
| Telegram alert | Sends notification | [ ] |
| Error handling | Logs without crash | [ ] |
| Recovery | Restarts after error | [ ] |

---

## 12. STEP 10: PRODUCTION DEPLOYMENT

### 12.1 Final Configuration

```bash
# Edit production settings
nano .env
```

**Production .env:**
```bash
NODE_ENV=production
DRY_RUN=false
LOG_LEVEL=warn

# Aggressive but safe
MAX_POSITIONS=5
MAX_POSITION_PERCENTAGE=0.25
MIN_POOL_TVL_USD=500000
MIN_VOLUME_24H_USD=100000
MIN_AI_CONFIDENCE=0.75

# Fast response
REBALANCE_CHECK_INTERVAL_MS=180000
POSITION_CHECK_INTERVAL_MS=30000
POOL_SCAN_INTERVAL_MS=180000

# Telegram notifications
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_IDS=your_chat_id
```

### 12.2 Start Production Services

```bash
# Stop test instance
pm2 stop meteora-test
pm2 delete meteora-test

# Start production
pm2 start ecosystem.config.js --name "meteora-prod"

# Save PM2 config
pm2 save

# Setup startup
pm2 startup
# Run the command shown

# Verify startup enabled
sudo systemctl status pm2-meteora
```

### 12.3 Setup Monitoring

```bash
# Install monitoring dashboard (optional)
pm2 install pm2-server-monit

# Or use built-in
pm2 monit

# Setup external monitoring (Sentry)
# npm install @sentry/node
# Configure in config
```

### 12.4 Final Verification

```bash
# Full system check
./scripts/health-check.sh

# Check all services
pm2 status

# Check logs
tail -20 logs/app.log

# Check database
docker compose exec postgres psql -U postgres -d meteora_trading -c "SELECT COUNT(*) FROM Position WHERE status = 'ACTIVE';"

# Check disk space
df -h

# Check memory
free -h
```

---

## 13. TROUBLESHOOTING

### 🔴 Critical Issues

#### Issue: "Cannot connect to PostgreSQL"
```bash
# Check if PostgreSQL running
docker compose ps

# If not running:
docker compose up -d postgres

# Check logs
docker compose logs postgres

# Verify credentials
# Check DATABASE_URL in .env matches docker-compose.yml

# Reset database (WARNING: deletes all data!)
docker compose down -v
docker compose up -d postgres
npm run db:migrate
```

#### Issue: "Private key invalid"
```bash
# Verify key format (should be base58)
echo $SOLANA_WALLET_PRIVATE_KEY | wc -c
# Should be ~88 characters

# Test with Solana CLI (optional)
solana-keygen pubkey ASK
# Enter your private key when prompted

# If error, regenerate key properly
```

#### Issue: "Out of memory"
```bash
# Check memory usage
free -h

# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Reduce memory usage in config
POOL_SCAN_LIMIT=50  # Reduce from 100
CACHE_TTL_SECONDS=60  # Reduce from 300
```

#### Issue: "Transaction failed"
```bash
# Check Solana RPC health
curl -s $SOLANA_RPC_URL -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Check wallet balance
curl -s $SOLANA_RPC_URL -X POST \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getBalance\",\"params\":[\"YOUR_WALLET\"]}"

# Check for insufficient funds
# Minimum: 0.05 SOL for gas + amount for trading
```

### 🟡 Common Issues

#### Issue: "Telegram not sending notifications"
```bash
# Test bot token
curl -s "https://api.telegram.org/botYOUR_TOKEN/getMe"

# Should return bot info
# If error, regenerate token with @BotFather

# Check chat ID
# Message your bot, then:
curl -s "https://api.telegram.org/botYOUR_TOKEN/getUpdates"
# Look for "chat":{"id":123456789

# Update .env with correct chat ID
```

#### Issue: "High CPU usage"
```bash
# Check which process
htop

# If Node.js high, reduce frequency
POOL_SCAN_INTERVAL_MS=300000  # 5 min instead of 3
REBALANCE_CHECK_INTERVAL_MS=300000  # 5 min

# If database high, add indexes
# Check slow queries in logs
```

#### Issue: "Disk full"
```bash
# Check usage
df -h

# Clean logs
find logs -name "*.log" -mtime +7 -delete

# Clean Docker
docker system prune -a

# Increase log rotation
echo 'rotate 7' | sudo tee /etc/logrotate.d/meteora-ai-lp
```

---

## 14. MAINTENANCE

### Daily Checks (2 minutes)

```bash
# Quick health check
./scripts/health-check.sh

# Check positions
pm2 logs --lines 20 | grep -E "(Position|Entry|Exit)"

# Check balance
tail -1 logs/app.log | grep Wallet
```

### Weekly Maintenance (15 minutes)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Update application
cd /opt/meteora-ai-lp
git pull origin main
npm install
npm run build
pm2 restart meteora-prod

# Backup database
./scripts/backup.sh

# Check logs for errors
grep ERROR logs/app.log | tail -20

# Clean old logs
sudo logrotate -f /etc/logrotate.d/meteora-ai-lp
```

### Monthly Maintenance (30 minutes)

```bash
# Full system update
sudo apt update && sudo apt full-upgrade -y
sudo reboot

# Security audit
grep -E "(ERROR|WARN|CRITICAL)" logs/app.log | wc -l

# Performance review
pm2 logs --lines 1000 | grep -E "(PnL|ROI)" | tail -30

# Dependency updates
npm outdated
npm update

# Database optimization
docker compose exec postgres psql -U postgres -d meteora_trading -c "VACUUM ANALYZE;"
```

### Emergency Procedures

#### Emergency Stop
```bash
# Stop all trading immediately
pm2 stop meteora-prod

# Close all positions manually via Meteora UI
# Or use emergency script:
./scripts/emergency-exit.sh

# Check wallet
solana balance YOUR_WALLET
```

#### Database Corruption
```bash
# Restore from backup
./scripts/restore.sh backup-2026-03-21.sql.gz

# Or reset and resync (positions lost!)
docker compose down -v
docker compose up -d postgres
npm run db:migrate
```

---

## ✅ INSTALLATION COMPLETE!

Your AI LP Trading System is now:
- ✅ Installed on Ubuntu
- ✅ Configured securely
- ✅ Running in production
- ✅ Monitored and maintained

### 🚀 Next Steps

1. **Monitor** - Watch logs for first 24 hours
2. **Optimize** - Adjust parameters based on performance
3. **Scale** - Gradually increase position sizes
4. **Backup** - Regular database backups
5. **Update** - Keep system updated monthly

### 📚 Documentation

- **User Guide:** `README.md`
- **Architecture:** `ARCHITECTURE_DIAGRAMS.md`
- **API Reference:** `QUICK_REFERENCE.md`
- **Security:** `SECURITY_FIXES.md`

### 🆘 Support

If issues arise:
1. Check `TROUBLESHOOTING` section above
2. Review logs: `tail -f logs/app.log`
3. Run health check: `./scripts/health-check.sh`
4. Check system resources: `htop`

---

**Happy Trading! 🚀**

*For questions or issues, refer to the troubleshooting section or consult the development team.*
