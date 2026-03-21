# 🤖 AI LP Trading System for Meteora DLMM + Jupiter

> **Autonomous AI Liquidity Fund System** - Automated liquidity provision with intelligent risk management.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-purple.svg)](https://solana.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Telegram Commands](#telegram-commands)
- [Risk Management](#risk-management)
- [Monitoring](#monitoring)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

This system is a sophisticated, fully automated liquidity provider (LP) bot designed for **Meteora's Dynamic Liquidity Market Maker (DLMM)** protocol on Solana, integrated with **Jupiter Aggregator** for optimal swap routing.

### Key Capabilities

- 🤖 **Multi-Agent AI System**: Scout, Analyst, Risk Manager, Executor, and Memory agents
- 🔄 **Auto Rebalance**: Intelligent range adjustment based on market conditions
- 🛡️ **Risk Management**: Multi-layer protection with circuit breakers
- 📊 **Real-time Dashboard**: WebSocket-powered live monitoring
- 📱 **Telegram Control**: Full mobile control and notifications
- ⚡ **MEV Protection**: Jito bundles for secure execution

### Performance Targets

| Metric | Target |
|--------|--------|
| Daily ROI | 0.3-0.5% |
| Annual ROI | 300-600% APR |
| Max Drawdown | < 10% |
| Win Rate | > 65% |
| Sharpe Ratio | > 1.5 |
| Uptime | 99.5% |

---

## ✨ Features

### 🤖 Multi-Agent AI System

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  SCOUT  │───▶│ ANALYST │───▶│  RISK   │───▶│ EXECUTOR│───▶│  MEMORY │
│  Agent  │    │  Agent  │    │ Manager │    │  Agent  │    │  Agent  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

- **Scout**: Continuously scans and ranks Meteora pools
- **Analyst**: Deep analysis with ML-powered predictions
- **Risk Manager**: Validates trades and enforces limits
- **Executor**: Executes trades with MEV protection
- **Memory**: Learns from results and optimizes strategies

### 🔄 Auto Rebalance System

- **Out of Range Detection**: Automatic range adjustment
- **Profit Taking**: Rebalance when targets are hit
- **IL Minimization**: Adaptive range sizing based on volatility
- **3 Modes**: Narrow (aggressive), Medium (balanced), Wide (safe)

### 🛡️ Risk Management

- **Position Limits**: Max 20% per pool, 5 concurrent positions
- **Circuit Breakers**: 6 types including daily loss and drawdown
- **Graduated Sizing**: Position size based on confidence and risk
- **Kill Switch**: Emergency stop with Telegram command

### 📊 Real-time Dashboard

- **Live PnL**: Realized and unrealized profit/loss
- **Position Monitor**: In-range status and performance
- **AI Insights**: Confidence scores and predictions
- **Risk Metrics**: Exposure and correlation heatmap

### 📱 Telegram Integration

```
Commands:
/start     - Activate bot
/stop      - Pause bot
/status    - Full system status
/positions - Detail all positions
/pnl       - Profit/loss report
/emergency - Kill switch
/settings  - View configuration
```

Notifications:
- 💰 Profit target reached
- ⚠️ Loss warnings
- ♻️ Rebalance alerts
- 🚨 Emergency alerts

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20.x+
- PostgreSQL 15+
- Redis 7+
- Solana wallet with SOL for gas

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/meteora-ai-lp.git
cd meteora-ai-lp

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Build project
npm run build

# Start development server
npm run dev

# Or start production server
npm start
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

---

## ⚙️ Configuration

### Environment Variables

See `.env.example` for complete list. Key variables:

```bash
# Blockchain
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WALLET_PRIVATE_KEY=your_private_key

# Trading
MAX_POSITIONS=5
MAX_PER_POOL=0.20
UPDATE_INTERVAL=180
STOP_LOSS_PERCENTAGE=0.03

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
AUTHORIZED_USERS=123456789,987654321

# Risk
DAILY_LOSS_LIMIT=0.05
MAX_DRAWDOWN=0.10
```

### Trading Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MAX_POSITIONS` | 5 | Max concurrent positions |
| `MAX_PER_POOL` | 0.20 | Max % of capital per pool |
| `MIN_POOL_TVL` | 500000 | Minimum pool TVL ($) |
| `UPDATE_INTERVAL` | 180 | Scan interval (seconds) |
| `MIN_AI_CONFIDENCE` | 0.75 | Minimum AI confidence |

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │   Web    │  │ Telegram │  │   API    │                │
│  │ Dashboard│  │   Bot    │  │  Server  │                │
│  └──────────┘  └──────────┘  └──────────┘                │
├─────────────────────────────────────────────────────────────┤
│                      CORE SERVICE LAYER                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Scout  │ │ Analyst │ │  Risk   │ │ Executor│          │
│  │  Agent  │ │  Agent  │ │ Manager │ │  Agent  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├─────────────────────────────────────────────────────────────┤
│                        DATA LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Postgres │  │  Redis   │  │  Files   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
├─────────────────────────────────────────────────────────────┤
│                   BLOCKCHAIN LAYER                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Meteora │  │  Jupiter │  │  Solana  │                  │
│  │   DLMM   │  │Aggregator│  │   RPC    │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Agent Flow

```
1. SCOUT scans all Meteora pools (every 3 min)
2. ANALYST evaluates top candidates with AI
3. RISK MANAGER validates against limits
4. EXECUTOR performs trades via Jupiter/Meteora
5. MEMORY stores results for learning
```

---

## 📚 API Documentation

### REST API

Base URL: `http://localhost:3000`

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System status |
| GET | `/api/positions` | List all positions |
| GET | `/api/positions/:id` | Position details |
| GET | `/api/pnl` | PnL report |
| GET | `/api/performance` | Performance metrics |
| POST | `/api/bot/start` | Start trading |
| POST | `/api/bot/stop` | Stop trading |
| POST | `/api/positions/:id/rebalance` | Force rebalance |

### WebSocket Events

Connect to: `ws://localhost:3000/ws`

#### Client → Server

```json
{
  "action": "subscribe",
  "channel": "positions"
}
```

#### Server → Client

```json
{
  "type": "position_update",
  "data": {
    "id": "pos_123",
    "pnl": { "percentage": 5.2, "usd": 100 }
  }
}
```

---

## 💬 Telegram Commands

### User Commands

| Command | Description | Access |
|---------|-------------|--------|
| `/start` | Activate bot | Authorized |
| `/stop` | Pause bot | Authorized |
| `/status` | System status | Authorized |
| `/positions` | All positions | Authorized |
| `/pnl` | PnL report | Authorized |
| `/pause` | Pause (keep positions) | Authorized |
| `/rebalance` | Force rebalance | Authorized |
| `/emergency` | Emergency stop | 2FA Required |
| `/settings` | View config | Authorized |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/set [key] [value]` | Modify setting |
| `/addliquidity` | Manual entry |
| `/withdraw` | Emergency withdrawal |

---

## 🛡️ Risk Management

### Circuit Breakers

| Type | Threshold | Action |
|------|-----------|--------|
| Daily Loss | > 5% | Stop new entries |
| Max Drawdown | > 10% | Emergency exit all |
| Gas Spike | > 0.01 SOL | Pause trading |
| TVL Crash | > 30% drop | Exit immediately |
| Volatility | > 3x normal | Reduce sizes |
| API Failure | 3 consecutive | Pause and alert |

### Position Limits

- Max 5 concurrent positions
- Max 20% capital per pool
- Min 10% cash reserve
- Stop loss at 3%
- Take profit at 5%

---

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "uptime": 86400,
  "database": "connected",
  "redis": "connected",
  "solana": "connected",
  "positions": 3,
  "daily_pnl": 0.0042
}
```

### Metrics (Prometheus)

Available at: `http://localhost:3000/metrics`

Key metrics:
- `meteora_positions_total`
- `meteora_pnl_daily`
- `meteora_trades_total`
- `meteora_ai_confidence`

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/meteora-ai-lp.git

# Create branch
git checkout -b feature/my-feature

# Make changes and commit
git commit -m "Add my feature"

# Push and create PR
git push origin feature/my-feature
```

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

---

## ⚠️ Disclaimer

**Trading cryptocurrency involves significant risk. This software is provided as-is without warranty. Use at your own risk.**

- Always test with small amounts first
- Monitor the bot closely
- Never invest more than you can afford to lose
- Past performance does not guarantee future results

---

## 📞 Support

- 📧 Email: support@example.com
- 💬 Telegram: @YourSupportBot
- 📖 Docs: https://docs.example.com

---

## 🙏 Acknowledgments

- [Meteora](https://meteora.ag/) - DLMM protocol
- [Jupiter](https://jup.ag/) - Swap aggregator
- [Solana](https://solana.com/) - Blockchain platform

---

**Built with ❤️ for the DeFi community**
