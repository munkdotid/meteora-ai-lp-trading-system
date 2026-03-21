# ✅ Pre-Deployment Checklist
# AI LP Trading System

Use this checklist before deploying to production.

---

## 📋 Environment Setup

### Server Configuration
- [ ] Ubuntu 22.04 LTS installed
- [ ] SSH access configured (key-based auth)
- [ ] Root password disabled
- [ ] SSH port changed (optional but recommended)
- [ ] Firewall (UFW) enabled
- [ ] Fail2ban installed and running
- [ ] Automatic security updates enabled

### System Resources
- [ ] Minimum 4GB RAM available
- [ ] Minimum 50GB disk space
- [ ] Swap space configured (4GB recommended)
- [ ] Timezone set to UTC
- [ ] Chrony/NTP for time sync

---

## 🔐 Security Checklist

### File Permissions
- [ ] `.env` file permission: `chmod 600 .env`
- [ ] `secrets/` directory: `chmod 700 secrets/`
- [ ] Log files: `chmod 640 logs/*.log`
- [ ] Scripts: `chmod +x scripts/*.sh`
- [ ] No secrets committed to git

### Secrets Management
- [ ] Private key stored securely (key file or env var)
- [ ] API keys not exposed in logs
- [ ] Database password strong (20+ chars)
- [ ] Redis password configured
- [ ] Telegram token secured

### Network Security
- [ ] PostgreSQL only accessible via localhost
- [ ] Redis only accessible via localhost
- [ ] API port (3000) firewalled if needed
- [ ] SSL/TLS configured for web interface (if exposed)

### Monitoring
- [ ] Log rotation configured
- [ ] Sentry/error tracking configured (optional)
- [ ] Telegram alerts working
- [ ] Health check script tested

---

## ⚙️ Configuration Checklist

### Required Environment Variables
```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong_password_20+chars>
POSTGRES_DB=meteora_trading
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/meteora_trading"

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=<strong_password>

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WALLET_PRIVATE_KEY=<base58_key>
# OR: WALLET_KEY_PATH=/opt/meteora-ai-lp/secrets/wallet.json

# Trading
DRY_RUN=true  # ← START WITH THIS!
MAX_POSITIONS=3
MAX_POSITION_PERCENTAGE=0.20
```

### Optional but Recommended
```bash
# Notifications
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_IDS=<chat_id1>,<chat_id2>

# Monitoring
SENTRY_DSN=<sentry_dsn>
HEALTH_CHECK_INTERVAL_MS=30000

# Advanced
JUPITER_API_URL=https://quote-api.jup.ag/v6
METEORA_API_URL=https://dlmm-api.meteora.ag
```

---

## 🧪 Testing Checklist

### Phase 1: DRY_RUN Testing (Required!)
- [ ] Application starts without errors
- [ ] Database connection successful
- [ ] Redis connection successful
- [ ] Solana RPC connection successful
- [ ] Wallet initializes correctly
- [ ] Scout scans pools ("🔍 Scanning..." in logs)
- [ ] Analyst evaluates opportunities
- [ ] Risk manager validates trades
- [ ] **DRY RUN messages appear** ("💡 DRY RUN: Would enter...")
- [ ] No real transactions executed
- [ ] Memory usage stable (< 70%)
- [ ] CPU usage normal (< 50%)
- [ ] Run for minimum 2 hours

### Phase 2: Small Live Test
- [ ] DRY_RUN set to false
- [ ] MAX_POSITIONS = 1
- [ ] MAX_POSITION_PERCENTAGE = 0.10
- [ ] Wallet has minimum 1 SOL
- [ ] Position created successfully
- [ ] Monitor for 24 hours
- [ ] No unexpected errors
- [ ] Telegram notifications received (if configured)

### Phase 3: Gradual Scale Up
- [ ] Day 1-2: 1 position, 10%
- [ ] Day 3-4: 2 positions, 15%
- [ ] Day 5-7: 3 positions, 20%
- [ ] After 1 week: Full settings (5 positions, 25%)

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All DRY_RUN tests passed
- [ ] Small live test completed (24 hours)
- [ ] Telegram notifications working
- [ ] Health checks passing
- [ ] Backup system tested
- [ ] Emergency procedures documented

### Deployment
- [ ] Stop test instance: `pm2 stop meteora-test`
- [ ] Update to production config
- [ ] Start production: `pm2 start ecosystem.config.js`
- [ ] Save PM2 config: `pm2 save`
- [ ] Enable startup: `pm2 startup`

### Post-Deployment (First 24 Hours)
- [ ] Monitor logs every 30 minutes
- [ ] Check wallet balance
- [ ] Verify positions created
- [ ] Verify no errors in logs
- [ ] Check system resources
- [ ] Test Telegram commands

---

## 📊 Monitoring Checklist

### Daily Checks (2 minutes)
- [ ] Run health check: `./scripts/health-check.sh`
- [ ] Check PM2 status: `pm2 status`
- [ ] Review last 20 log lines: `pm2 logs --lines 20`
- [ ] Verify positions: `pm2 logs | grep -E "(Entry|Exit)"`

### Weekly Checks (15 minutes)
- [ ] Review PnL: `pm2 logs | grep PnL`
- [ ] Check disk space: `df -h`
- [ ] Check memory: `free -h`
- [ ] Review errors: `grep ERROR logs/app.log`
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Backup database: `./scripts/backup.sh`

### Monthly Checks (30 minutes)
- [ ] Full system update
- [ ] Dependency updates: `npm outdated`
- [ ] Security audit: Review logs
- [ ] Performance review
- [ ] Database optimization: `VACUUM ANALYZE`
- [ ] SSL certificate renewal (if using)

---

## 🆘 Emergency Procedures

### Emergency Stop
```bash
# Immediate stop
pm2 stop meteora-prod

# Close all positions manually via Meteora UI
# Or use emergency script if available
```

### Database Recovery
```bash
# Restore from backup
./scripts/restore.sh backup-2026-03-21.sql.gz

# Or reset (WARNING: loses all data!)
docker compose down -v
docker compose up -d postgres
npm run db:migrate
```

### Contact Information
- [ ] Document emergency contacts
- [ ] Save exchange support contacts
- [ ] Document wallet recovery procedure
- [ ] Save server provider support

---

## ✅ Final Sign-Off

| Item | Status | Signed By | Date |
|------|--------|-----------|------|
| Environment configured | ⬜ | | |
| Security hardened | ⬜ | | |
| DRY_RUN tested (2+ hours) | ⬜ | | |
| Small live test (24 hours) | ⬜ | | |
| Telegram notifications working | ⬜ | | |
| Health checks passing | ⬜ | | |
| Backup system tested | ⬜ | | |
| Emergency procedures known | ⬜ | | |
| **READY FOR PRODUCTION** | ⬜ | | |

---

## 📚 Documentation Reference

| Document | Purpose |
|----------|---------|
| `INSTALLATION_MANUAL.md` | Complete installation guide |
| `QUICKSTART.md` | 5-minute quick start |
| `SECURITY_FIXES.md` | Security audit and fixes |
| `ARCHITECTURE_DIAGRAMS.md` | System architecture |
| `README.md` | General overview |
| `QUICK_REFERENCE.md` | Command cheat sheet |

---

**⚠️ WARNING:** Do NOT deploy to production without completing ALL checklists!

Start with DRY_RUN=true and gradually scale up after successful testing.

*Last updated: 2026-03-21*
