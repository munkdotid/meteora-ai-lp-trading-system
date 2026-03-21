#!/bin/bash
# ==========================================
# Ubuntu Setup Script
# AI LP Trading System
# ==========================================

set -e

echo "🚀 Setting up AI LP Trading System on Ubuntu..."

# ==========================================
# CHECK REQUIREMENTS
# ==========================================
echo "📋 Checking requirements..."

# Check if running on Ubuntu
if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
    echo "⚠️  Warning: This script is designed for Ubuntu"
fi

# Check architecture
ARCH=$(uname -m)
echo "   Architecture: $ARCH"

# ==========================================
# UPDATE SYSTEM
# ==========================================
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# ==========================================
# INSTALL DEPENDENCIES
# ==========================================
echo "📦 Installing dependencies..."

# Core dependencies
sudo apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    jq

# ==========================================
# INSTALL NODE.JS (via NVM)
# ==========================================
echo "📦 Installing Node.js..."

if ! command -v nvm &> /dev/null; then
    echo "   Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

echo "   Node.js version: $(node --version)"
echo "   NPM version: $(npm --version)"

# ==========================================
# INSTALL PM2
# ==========================================
echo "📦 Installing PM2..."
npm install -g pm2

# Setup PM2 startup
pm2 startup systemd
sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u $USER --hp $HOME

# ==========================================
# INSTALL DOCKER & DOCKER COMPOSE
# ==========================================
echo "📦 Installing Docker..."

if ! command -v docker &> /dev/null; then
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. Please log out and back in for docker group changes to take effect."
else
    echo "   Docker already installed: $(docker --version)"
fi

# Install Docker Compose (standalone)
if ! command -v docker-compose &> /dev/null; then
    echo "   Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

echo "   Docker Compose version: $(docker-compose --version)"

# ==========================================
# CREATE APP DIRECTORY
# ==========================================
echo "📂 Setting up application directory..."

APP_DIR="/opt/meteora-ai-lp"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Create subdirectories
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/secrets
mkdir -p $APP_DIR/backups
mkdir -p $APP_DIR/models
mkdir -p $APP_DIR/nginx/ssl
mkdir -p $APP_DIR/nginx/logs
mkdir -p $APP_DIR/monitoring/grafana/dashboards
mkdir -p $APP_DIR/monitoring/grafana/datasources
mkdir -p $APP_DIR/scripts

echo "   Created directory structure at $APP_DIR"

# ==========================================
# SETUP LOG ROTATION
# ==========================================
echo "📦 Setting up log rotation..."

sudo tee /etc/logrotate.d/meteora-ai-lp > /dev/null <<EOF
/opt/meteora-ai-lp/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# ==========================================
# SETUP FIREWALL (UFW)
# ==========================================
echo "🔒 Configuring firewall..."

if command -v ufw &> /dev/null; then
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow ssh
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 3000/tcp
    sudo ufw allow 3001/tcp
    sudo ufw --force enable
    echo "✅ Firewall configured"
else
    echo "   UFW not installed, skipping firewall config"
fi

# ==========================================
# SETUP SYSTEMD SERVICE
# ==========================================
echo "📦 Setting up systemd service..."

sudo tee /etc/systemd/system/meteora-ai-lp.service > /dev/null <<EOF
[Unit]
Description=AI LP Trading System
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=/opt/meteora-ai-lp
ExecStart=/usr/local/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/local/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/local/bin/pm2 stop ecosystem.config.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable meteora-ai-lp

echo "✅ Systemd service created"

# ==========================================
# SETUP SWAP (if needed)
# ==========================================
echo "💾 Checking swap space..."

if ! swapon --show | grep -q "swap"; then
    echo "   Creating 4GB swap file..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap file created"
else
    echo "   Swap already configured"
fi

# ==========================================
# SETUP TIMEZONE
# ==========================================
echo "🌍 Setting timezone to UTC..."
sudo timedatectl set-timezone UTC

# ==========================================
# PRINT SUMMARY
# ==========================================
echo ""
echo "✅ Ubuntu setup complete!"
echo ""
echo "📋 Summary:"
echo "   - Node.js $(node --version) installed"
echo "   - PM2 installed"
echo "   - Docker installed"
echo "   - Directory created at $APP_DIR"
echo "   - Firewall configured"
echo "   - Systemd service created"
echo ""
echo "📝 Next steps:"
echo "   1. Copy your application code to $APP_DIR"
echo "   2. Create .env file: cp .env.example .env"
echo "   3. Edit .env with your configuration"
echo "   4. Install dependencies: npm install"
echo "   5. Start with: npm run pm2:start"
echo "   6. Or use Docker: docker-compose up -d"
echo ""
echo "🔧 Useful commands:"
echo "   pm2 status              - Check process status"
echo "   pm2 logs                - View logs"
echo "   pm2 monit               - Monitor processes"
echo "   docker-compose ps       - Check containers"
echo "   docker-compose logs -f  - View container logs"
echo ""
echo "💡 Note: You may need to log out and back in for Docker group changes to take effect."
