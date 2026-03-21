# ⚡ Quick Start Guide
# AI LP Trading System

**5-Minute Setup for Experienced Users**

---

## 🎯 Prerequisites

- Ubuntu 22.04 server (2GB RAM, 50GB SSD)
- SSH access
- GitHub token
- Solana wallet private key
- Telegram bot token (optional)

---

## 🚀 5-Minute Installation

### Step 1: Run Automated Setup (2 minutes)

```bash
# SSH to your server
ssh root@YOUR_SERVER_IP

# Download and run installer
curl -fsSL https://raw.githubusercontent.com/munkdotid/meteora-ai-lp-trading-system/main/scripts/quick-install.sh | sudo bash

# Or manually:
# sudo ./scripts/quick-install.sh
```

### Step 2: Switch to Trading User (30 seconds)

```bash
su - meteora
cd /opt/meteora-ai-lp
```

### Step 3: Clone Repository (1 minute)

```bash
git clone https://YOUR_TOKEN@github.com/munkdotid/meteora-ai-lp-trading-system.git .

# Or with SSH:
git clone git@github.com:munkdotid/meteora-ai-lp-trading-system.git .
```

### Step 4: Configure (1 minute)

```bash
# Copy and edit config
cp .env.example .env
nano .env

# Minimum required:
# SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# SOLANA_WALLET_PRIVATE_KEY=your_key_here
# DATABASE_URL=postgresql://postgres:pass@localhost:5432/meteora_trading
# REDIS_URL=redis://localhost:6379
# DRY_RUN=true  # ← MUST be true for testing!
```

### Step 5: Start Services (30 seconds)

```bash
# Start infrastructure
docker compose up -d postgres redis

# Install dependencies
npm install

# Build
npm run build

# Test (DRY RUN - NO REAL MONEY)
DRY_RUN=true npm start

# Or with PM2:
DRY_RUN=true pm2 start ecosystem.config.js
```

---

## ✅ Verify Installation

```bash
# Health check
./scripts/health-check.sh

# Should show:
# ✅ Database: Connected
# ✅ Redis: Connected
# ✅ Solana RPC: Responsive
# ✅ Wallet: Valid

# Check logs
tail -f logs/app.log

# Expected output:
# ✅ Wallet initialized: 7xd...
# ✅ Database connected
# 🔍 Scanning pools...
# 💡 DRY RUN: Would enter SOL-USDC
```

---

## 🧪 Testing (Required before live!)

### Phase 1: DRY_RUN (2-4 hours)

```bash
# Keep DRY_RUN=true
# Monitor logs - should see "DRY RUN" messages
# No real transactions
# Verify no errors
```

### Phase 2: Small Live Test (1 day)

```bash
# Edit .env
DRY_RUN=false
MAX_POSITIONS=1
MAX_POSITION_PERCENTAGE=0.10

# Restart
pm2 restart all

# Monitor closely for 24 hours
```

### Phase 3: Production (After 1 week)

```bash
# Gradually increase
MAX_POSITIONS=3
MAX_POSITION_PERCENTAGE=0.20
```

---

## 🎮 Common Commands

```bash
# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop all

# Restart
pm2 restart all

# View logs
pm2 logs

# Monitor resources
pm2 monit

# Status
pm2 status

# Health check
./scripts/health-check.sh

# Backup database
./scripts/backup.sh

# Emergency stop
pm2 stop all
```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Database error" | `docker compose up -d postgres` |
| "Private key invalid" | Check key format (base58, ~88 chars) |
| "Out of memory" | Add swap: `sudo fallocate -l 4G /swapfile` |
| "Port already in use" | `sudo lsof -i :3000` then `kill PID` |
| "Permission denied" | `chmod 600 .env && chmod 700 secrets` |

---

## 📊 Next Steps

1. ✅ Test in DRY_RUN mode (2-4 hours)
2. ✅ Small live test (1 day, 0.5-1 SOL)
3. ✅ Gradual scale up (1 week)
4. ✅ Full production deployment
5. ✅ Setup Telegram notifications
6. ✅ Configure SSL (if exposing web UI)

---

## 📚 Full Documentation

- **Installation:** `INSTALLATION_MANUAL.md` (detailed)
- **Architecture:** `ARCHITECTURE_DIAGRAMS.md`
- **Security:** `SECURITY_FIXES.md`
- **API:** `QUICK_REFERENCE.md`

---

## 🆘 Need Help?

```bash
# Check system status
./scripts/health-check.sh

# View detailed logs
pm2 logs --lines 100

# Check resources
htop

# Emergency stop
pm2 stop all
```

---

**⚡ You're ready to trade! Start with DRY_RUN=true and monitor closely.**

*For detailed instructions, see INSTALLATION_MANUAL.md*
