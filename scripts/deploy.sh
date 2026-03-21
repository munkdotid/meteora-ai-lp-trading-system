#!/bin/bash
# ==========================================
# Deploy Script for Ubuntu VPS
# ==========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_DIR="/opt/meteora-ai-lp"
GITHUB_REPO="https://github.com/munkdotid/meteora-ai-lp-trading-system.git"
BRANCH="main"

# Functions
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
if [ "$EUID" -eq 0 ]; then
    print_error "Do not run this script as root"
    exit 1
fi

# Parse arguments
DEPLOY_MODE=${1:-"pm2"}  # pm2 or docker
SKIP_BUILD=${2:-"false"}

echo ""
echo "🚀 AI LP Trading System - Deploy Script"
echo "======================================"
echo ""
print_status "Deploy mode: $DEPLOY_MODE"
print_status "Skip build: $SKIP_BUILD"
echo ""

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v git &> /dev/null; then
    print_error "Git not found. Please install git first."
    exit 1
fi

if [ "$DEPLOY_MODE" == "pm2" ] && ! command -v pm2 &> /dev/null; then
    print_error "PM2 not found. Please run setup-ubuntu.sh first."
    exit 1
fi

if [ "$DEPLOY_MODE" == "docker" ] && ! command -v docker &> /dev/null; then
    print_error "Docker not found. Please run setup-ubuntu.sh first."
    exit 1
fi

print_success "Prerequisites OK"

# Navigate to app directory
if [ ! -d "$APP_DIR" ]; then
    print_status "Creating app directory..."
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
fi

cd $APP_DIR

# Backup current deployment
if [ -d ".git" ]; then
    print_status "Creating backup..."
    BACKUP_DIR="/tmp/meteora-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p $BACKUP_DIR
    cp -r logs $BACKUP_DIR/ 2>/dev/null || true
    cp .env $BACKUP_DIR/ 2>/dev/null || true
    cp -r secrets $BACKUP_DIR/ 2>/dev/null || true
    print_success "Backup created at $BACKUP_DIR"
fi

# Clone or pull latest code
if [ -d ".git" ]; then
    print_status "Pulling latest code..."
    git fetch origin
    git reset --hard origin/$BRANCH
else
    print_status "Cloning repository..."
    git clone -b $BRANCH $GITHUB_REPO .
fi

print_success "Code updated"

# Install dependencies
print_status "Installing dependencies..."
npm ci
print_success "Dependencies installed"

# Setup environment if not exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found"
    if [ -f "$BACKUP_DIR/.env" ]; then
        print_status "Restoring .env from backup..."
        cp $BACKUP_DIR/.env .
    else
        print_status "Creating .env from example..."
        cp .env.example .env
        print_warning "Please edit .env file with your configuration!"
        nano .env
    fi
fi

# Restore backups
if [ -d "$BACKUP_DIR" ]; then
    print_status "Restoring data from backup..."
    cp -r $BACKUP_DIR/logs . 2>/dev/null || true
    cp -r $BACKUP_DIR/secrets . 2>/dev/null || true
    print_success "Data restored"
fi

# Build application
if [ "$SKIP_BUILD" != "true" ]; then
    print_status "Building application..."
    npm run build
    print_success "Build complete"
fi

# Deploy based on mode
if [ "$DEPLOY_MODE" == "docker" ]; then
    print_status "Deploying with Docker..."
    
    # Stop existing containers
    docker-compose down 2>/dev/null || true
    
    # Build and start
    docker-compose build --no-cache
    docker-compose up -d
    
    # Wait for health check
    print_status "Waiting for services to start..."
    sleep 10
    
    # Check health
    if curl -f http://localhost:3001/health &> /dev/null; then
        print_success "Docker deployment successful!"
    else
        print_error "Health check failed"
        docker-compose logs app
        exit 1
    fi
    
    print_status "Docker containers:"
    docker-compose ps
    
elif [ "$DEPLOY_MODE" == "pm2" ]; then
    print_status "Deploying with PM2..."
    
    # Ensure database is running
    if ! pg_isready -h localhost &> /dev/null; then
        print_warning "PostgreSQL not running. Starting with Docker..."
        docker-compose up -d db redis
        sleep 5
    fi
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    npm run db:generate
    
    # Run migrations
    print_status "Running database migrations..."
    npm run db:migrate
    
    # Deploy with PM2
    print_status "Starting with PM2..."
    pm2 start ecosystem.config.js --env production
    
    # Save PM2 config
    pm2 save
    
    # Wait for health check
    print_status "Waiting for services to start..."
    sleep 5
    
    # Check health
    if curl -f http://localhost:3001/health &> /dev/null; then
        print_success "PM2 deployment successful!"
    else
        print_error "Health check failed"
        pm2 logs
        exit 1
    fi
    
    print_status "PM2 processes:"
    pm2 status
fi

# Cleanup
if [ -d "$BACKUP_DIR" ]; then
    print_status "Cleaning up backup..."
    rm -rf $BACKUP_DIR
fi

echo ""
echo "======================================"
print_success "Deployment complete!"
echo ""
echo "📝 Useful commands:"
echo "   make status           - Check system status"
echo "   make health-check     - Run health check"
echo "   make logs             - View logs"
echo ""

if [ "$DEPLOY_MODE" == "docker" ]; then
    echo "🐳 Docker commands:"
    echo "   docker-compose ps     - List containers"
    echo "   docker-compose logs -f - View logs"
    echo "   docker-compose down   - Stop services"
else
    echo "⚙️ PM2 commands:"
    echo "   pm2 status            - Process status"
    echo "   pm2 logs              - View logs"
    echo "   pm2 monit             - Monitor processes"
    echo "   pm2 stop all          - Stop all processes"
fi

echo ""
print_status "System URL: http://$(hostname -I | awk '{print $1}'):3000"
print_status "Health Check: http://$(hostname -I | awk '{print $1}'):3001/health"
echo ""
