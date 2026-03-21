#!/bin/bash
# ==========================================
# QUICK INSTALL SCRIPT
# AI LP Trading System - Ubuntu 22.04
# ==========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="meteora-ai-lp"
APP_DIR="/opt/${APP_NAME}"
USER="meteora"
NODE_VERSION="20"

# Helper functions
print_status() {
    echo -e "${BLUE}[$(date +%Y-%m-%d\ %H:%M:%S)]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        print_status "Please run: sudo ./quick-install.sh"
        exit 1
    fi
}

# Check Ubuntu version
check_os() {
    if ! grep -q "Ubuntu 22.04" /etc/os-release 2>/dev/null; then
        print_warning "This script is designed for Ubuntu 22.04 LTS"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    print_success "OS check passed"
}

# Update system
update_system() {
    print_status "Updating system packages..."
    apt update -qq
    apt upgrade -y -qq
    print_success "System updated"
}

# Install base dependencies
install_base_deps() {
    print_status "Installing base dependencies..."
    apt install -y -qq \
        curl \
        wget \
        git \
        vim \
        nano \
        htop \
        net-tools \
        ufw \
        fail2ban \
        chrony \
        build-essential \
        python3 \
        make \
        g++ \
        ca-certificates \
        gnupg \
        lsb-release
    print_success "Base dependencies installed"
}

# Install Docker
install_docker() {
    print_status "Installing Docker..."
    
    # Remove old versions
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Add Docker repo
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    
    apt update -qq
    apt install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start Docker
    systemctl enable docker
    systemctl start docker
    
    print_success "Docker installed"
}

# Create trading user
create_user() {
    print_status "Creating trading user..."
    
    if id "$USER" &>/dev/null; then
        print_warning "User $USER already exists"
    else
        useradd -m -s /bin/bash "$USER"
        usermod -aG sudo "$USER"
        usermod -aG docker "$USER"
        
        # Set password
        PASSWORD=$(openssl rand -base64 12)
        echo "$USER:$PASSWORD" | chpasswd
        
        print_success "User $USER created"
        print_status "Temporary password: $PASSWORD"
        print_status "Please change this after first login: passwd"
    fi
}

# Setup directories
setup_directories() {
    print_status "Setting up directories..."
    
    mkdir -p "$APP_DIR"
    mkdir -p "$APP_DIR/logs"
    mkdir -p "$APP_DIR/secrets"
    mkdir -p "$APP_DIR/backups"
    
    chown -R "$USER:$USER" "$APP_DIR"
    chmod 755 "$APP_DIR"
    chmod 755 "$APP_DIR/logs"
    chmod 700 "$APP_DIR/secrets"
    chmod 700 "$APP_DIR/backups"
    
    print_success "Directories created"
}

# Install Node.js via NVM
install_node() {
    print_status "Installing Node.js $NODE_VERSION..."
    
    # Install NVM as trading user
    su - "$USER" -c "
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR=\"\$HOME/.nvm\"
        [ -s \"\$NVM_DIR/nvm.sh\" ] && \\. \"\$NVM_DIR/nvm.sh\"
        nvm install $NODE_VERSION
        nvm use $NODE_VERSION
        nvm alias default $NODE_VERSION
        npm install -g pm2
    "
    
    print_success "Node.js $NODE_VERSION installed"
}

# Configure firewall
setup_firewall() {
    print_status "Configuring firewall..."
    
    # Reset UFW
    ufw --force reset
    
    # Default deny
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (customize port if needed)
    ufw allow 22/tcp
    
    # Allow HTTP/HTTPS (if using web interface)
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow application port (if exposing API)
    ufw allow 3000/tcp
    
    # Enable
    ufw --force enable
    
    print_success "Firewall configured"
    ufw status
}

# Configure fail2ban
setup_fail2ban() {
    print_status "Configuring fail2ban..."
    
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF
    
    systemctl enable fail2ban
    systemctl restart fail2ban
    
    print_success "Fail2ban configured"
}

# Setup logrotate
setup_logrotate() {
    print_status "Setting up log rotation..."
    
    cat > /etc/logrotate.d/meteora-ai-lp << 'EOF'
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
        /usr/bin/pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
EOF
    
    print_success "Log rotation configured"
}

# Main installation
main() {
    echo "=========================================="
    echo "  AI LP Trading System - Quick Install"
    echo "=========================================="
    echo ""
    
    check_root
    check_os
    
    print_status "Starting installation..."
    
    # Step 1: Update system
    update_system
    
    # Step 2: Install dependencies
    install_base_deps
    install_docker
    
    # Step 3: Setup user and directories
    create_user
    setup_directories
    
    # Step 4: Install Node.js
    install_node
    
    # Step 5: Security
    setup_firewall
    setup_fail2ban
    setup_logrotate
    
    # Summary
    echo ""
    echo "=========================================="
    print_success "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Switch to trading user: su - $USER"
    echo "2. Navigate to: cd $APP_DIR"
    echo "3. Clone repository: git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git ."
    echo "4. Follow: INSTALLATION_MANUAL.md for configuration"
    echo ""
    echo "Manual: https://github.com/munkdotid/meteora-ai-lp-trading-system/blob/main/INSTALLATION_MANUAL.md"
    echo ""
}

# Run main function
main "$@"
