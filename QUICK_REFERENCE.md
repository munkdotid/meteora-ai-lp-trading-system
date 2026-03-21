# 📋 Quick Reference Guide
# AI LP Trading System

## 🎯 Common Tasks

### Start Development
```bash
cd C:\meteora_bot
npm install
npm run dev
```

### Docker Development
```bash
docker-compose up -d db redis
npm run dev
```

### Production Deployment
```bash
npm run build
npm run pm2:start
```

### Database Operations
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Open Prisma Studio (GUI)
npm run db:studio
```

---

## 🔑 Key Files Reference

| File | Purpose |
|------|---------|
| `.env` | Configuration (copy from .env.example) |
| `src/config/index.ts` | Centralized config |
| `src/agents/*.ts` | AI Agents implementation |
| `prisma/schema.prisma` | Database schema |
| `docker-compose.yml` | Services orchestration |

---

## 📊 System Architecture

```
User → Telegram/Web → API → Agents → Services → Blockchain
              ↓         ↓        ↓
           Database   Redis   Notifications
```

**Agents:**
- Scout → Scan pools
- Analyst → AI decisions
- Risk Manager → Validation
- Executor → Trade execution

---

## ⚙️ Critical Config Values

```javascript
// Trading (in .env)
MAX_POSITIONS=5              // Max concurrent
MAX_PER_POOL=0.20            // 20% per pool
MIN_AI_CONFIDENCE=0.75       // 75% confidence
UPDATE_INTERVAL=180          // 3 minutes
STOP_LOSS_PERCENTAGE=0.03    // 3% stop loss

// Risk
DAILY_LOSS_LIMIT=0.05        // 5% daily limit
MAX_DRAWDOWN=0.10           // 10% max drawdown

// Telegram
AUTHORIZED_USERS=123456789   // Comma-separated IDs
```

---

## 🤖 Agent Workflows

### Entry Flow
```
Cron → Scout.scanAllPools() → Analyst.analyzeOpportunity()
    → RiskManager.validateTrade() → Executor.executeEntry()
        → Telegram.notifyEntry() + DB.save()
```

### Monitor Flow
```
setInterval() → checkPositions() → rebalanceCheck()
    → if (outOfRange) → executeRebalance()
        → Telegram.notifyRebalance()
```

---

## 📱 Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Activate bot |
| `/stop` | Pause bot |
| `/status` | Full status |
| `/positions` | All positions |
| `/pnl` | Profit/loss |
| `/emergency` | Kill switch |

---

## 🛡️ Risk Limits

| Limit | Value | Action |
|-------|-------|--------|
| Daily Loss | > 5% | Stop new entries |
| Max Drawdown | > 10% | Emergency exit |
| Gas Spike | > 0.01 SOL | Pause |
| TVL Drop | > 30% | Exit pool |

---

## 📈 Performance Targets

- **Daily ROI**: 0.3-0.5%
- **Annual ROI**: 300-600%
- **Max Drawdown**: < 10%
- **Win Rate**: > 65%
- **Sharpe**: > 1.5

---

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs db

# Reset database (careful!)
docker-compose down -v
docker-compose up -d db
```

### Redis Connection Error
```bash
# Check Redis status
docker-compose logs redis
redis-cli ping
```

### Transaction Failed
```bash
# Check logs
tail -f logs/trades-*.log

# Check Solana RPC
curl $SOLANA_RPC_URL -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getHealth"}'
```

---

## 📝 Log Files

| Log File | Content |
|----------|---------|
| `logs/application-*.log` | General logs |
| `logs/trades-*.log` | Trade executions |
| `logs/ai-decisions-*.log` | AI decisions |
| `logs/error-*.log` | Errors only |

---

## 🔍 Debugging

```javascript
// Enable debug mode
DEBUG=true npm run dev

// Log specific component
logger.debug('Message', { data: value });

// Check agent state
console.log(scoutAgent.getCachedAnalysis(poolAddress));
console.log(riskManager.getDailyPnL());
```

---

## 🚀 Deployment Checklist

- [ ] `.env` configured with real keys
- [ ] Database migrated
- [ ] Wallet has SOL for gas
- [ ] Telegram bot created
- [ ] VPS firewall configured
- [ ] SSL certificate installed
- [ ] Backups configured
- [ ] Monitoring enabled

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `BRD_AI_LP_Trading_System.md` | Full specs |
| `ARCHITECTURE_DIAGRAMS.md` | Visual design |
| `README.md` | User guide |
| `PROJECT_SUMMARY.md` | Overview |
| `QUICK_REFERENCE.md` | This file |

---

## 💡 Pro Tips

1. **Start Small**: Test with 1-2 positions first
2. **Monitor Closely**: Watch Telegram alerts
3. **Adjust Config**: Tune based on market conditions
4. **Backup Wallet**: Keep keys safe
5. **Track Performance**: Review daily reports

---

## 🆘 Emergency Procedures

### Kill Switch
```bash
# Via Telegram
/emergency

# Via API
curl -X POST http://localhost:3000/api/bot/emergency \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Stop All Positions
```bash
# Via Telegram
/stop

# Graceful exit all positions
```

---

**Need Help?** Check `BRD_AI_LP_Trading_System.md` for detailed specs.

**Quick Start?** See `README.md` for full setup instructions.

---

*Last Updated: 2026-03-21*
