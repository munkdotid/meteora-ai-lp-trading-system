# 🐧 Ubuntu Setup Guide
# AI LP Trading System

This guide covers installation and setup on Ubuntu 20.04/22.04 LTS.

---

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 50 GB SSD | 100+ GB SSD |
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| Network | Stable internet | Low-latency connection |

---

## 🚀 Quick Setup (Automated)

Run the automated setup script:

```bash
# Clone repository
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git
cd meteora-ai-lp-trading-system

# Run Ubuntu setup script
chmod +x scripts/setup-ubuntu.sh
sudo ./scripts/setup-ubuntu.sh

# Setup environment
cp .env.example .env
nano .env  # Edit with your configuration

# Install dependencies
make install

# Build and start
make quick-start
```

---

## 🛠️ Manual Setup

### Step 1: System Update

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Step 2: Install Node.js 20

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version  # v20.x.x
npm --version   # 10.x.x
```

### Step 3: Install PM2

```bash
npm install -g pm2
pm2 startup systemd
sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u $USER --hp $HOME
```

### Step 4: Install Docker

```bash
# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker-compose --version
```

### Step 5: Setup Application

```bash
# Create application directory
sudo mkdir -p /opt/meteora-ai-lp
sudo chown $USER:$USER /opt/meteora-ai-lp

# Clone repository
cd /opt
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git meteora-ai-lp
cd meteora-ai-lp

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env

# Generate Prisma client
npm run db:generate
```

---

## ⚙️ Environment Configuration

Edit `.env` file:

```bash
# Required
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WALLET_PRIVATE_KEY=your_base58_private_key

# Database
DATABASE_URL=postgresql://meteora_user:your_password@localhost:5432/meteora_bot
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
AUTHORIZED_USERS=your_telegram_id

# Trading (adjust as needed)
MAX_POSITIONS=5
MAX_PER_POOL=0.20
```

**⚠️ Security Note:** Never commit your `.env` file. The private key gives access to your funds!

---

## 🐳 Docker Deployment (Recommended)

### Method 1: Docker Compose (Full Stack)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Check status
docker-compose ps

# Stop services
docker-compose down
```

### Method 2: PM2 + Local Database

```bash
# Setup database with Docker
docker-compose up -d db redis

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
npm run pm2:start

# View logs
pm2 logs

# Monitor
pm2 monit
```

---

## 📊 Makefile Commands

Use the convenient Makefile:

```bash
# Show all commands
make help

# Development
make dev              # Start with hot reload
make install          # Install dependencies
make build            # Build TypeScript

# Production
make pm2-start        # Start with PM2
make pm2-stop         # Stop PM2
make pm2-restart      # Restart PM2
make pm2-logs         # View logs

# Docker
make docker-up        # Start containers
make docker-down      # Stop containers
make docker-logs      # View logs

# Utilities
make health-check     # Run health check
make db-backup        # Backup database
make status           # Show system status
```

---

## 🔒 Security Setup

### 1. Firewall (UFW)

```bash
# Enable firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw --force enable

# Check status
sudo ufw status
```

### 2. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install -y certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
sudo chown $USER:$USER nginx/ssl/*.pem
sudo chmod 600 nginx/ssl/*.pem
```

### 3. File Permissions

```bash
# Set correct permissions
chmod 600 .env
chmod 700 secrets
chmod 600 secrets/*
chmod +x scripts/*.sh
```

---

## 🔄 Auto-Start on Boot

### Method 1: Systemd Service

The setup script creates a systemd service:

```bash
# Enable service
sudo systemctl enable meteora-ai-lp

# Start service
sudo systemctl start meteora-ai-lp

# Check status
sudo systemctl status meteora-ai-lp

# View logs
sudo journalctl -u meteora-ai-lp -f
```

### Method 2: PM2 Startup

```bash
# Save PM2 config
pm2 save

# Setup startup script
pm2 startup systemd
```

---

## 📈 Monitoring

### Health Check

```bash
# Run health check
make health-check

# Continuous monitoring
make health-watch
```

### PM2 Monitoring

```bash
# Show status
pm2 status

# Monitor in real-time
pm2 monit

# View logs
pm2 logs
```

### Docker Monitoring

```bash
# Container stats
docker stats

# Container logs
docker-compose logs -f app
```

---

## 🗄️ Database Management

### Backup

```bash
# Manual backup
make db-backup

# Automated backup (runs daily via cron)
crontab -e
# Add: 0 0 * * * /opt/meteora-ai-lp/scripts/backup.sh
```

### Restore

```bash
# Restore from backup
gunzip < backups/meteora_backup_YYYYMMDD_HHMMSS.sql.gz | \
  psql -h localhost -U meteora_user meteora_bot
```

---

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Permission Denied

```bash
# Fix permissions
make permissions

# Or manually:
sudo chown -R $USER:$USER /opt/meteora-ai-lp
chmod +x scripts/*.sh
```

### Out of Memory

```bash
# Add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Docker Issues

```bash
# Reset Docker
docker-compose down -v
docker system prune -f
docker-compose up -d
```

---

## 🔄 Updates

### Update Application

```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart
make pm2-restart
```

### Update System

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

---

## 📚 Directory Structure on Ubuntu

```
/opt/meteora-ai-lp/
├── 📁 logs/                 # Application logs
├── 📁 secrets/              # Private keys (secure)
├── 📁 backups/              # Database backups
├── 📁 models/               # AI models
├── 📁 nginx/
│   ├── nginx.conf          # Nginx configuration
│   ├── ssl/                # SSL certificates
│   └── logs/               # Nginx logs
├── 📁 scripts/
│   ├── setup-ubuntu.sh     # Ubuntu setup
│   ├── backup.sh           # Backup script
│   └── health-check.sh     # Health check
├── 📁 monitoring/          # Prometheus/Grafana configs
└── 📁 src/                  # Source code
```

---

## 🆘 Emergency Procedures

### Kill Switch

```bash
# Via Telegram
/emergency

# Via command line
pm2 stop ecosystem.config.js

# Stop Docker
docker-compose down
```

### Reset Everything

```bash
# WARNING: This will delete all data!
make reset
```

---

## 📞 Support

- Check logs: `make logs`
- Health check: `make health-check`
- PM2 status: `pm2 status`
- Docker status: `docker-compose ps`

---

**Last Updated:** 2026-03-21  
**Tested on:** Ubuntu 20.04 LTS, Ubuntu 22.04 LTS
