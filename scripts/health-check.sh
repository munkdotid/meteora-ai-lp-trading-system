#!/bin/bash
# ==========================================
# Health Check Script for Ubuntu
# ==========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_URL="${APP_URL:-http://localhost:3001}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"

# Function to check health
check_health() {
    local response
    local http_code
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/health" 2>/dev/null || echo "000")
    
    if [ "$response" == "200" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    local usage
    usage=$(df /opt/meteora-ai-lp | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$usage" -gt 90 ]; then
        echo -e "${RED}⚠️  Disk usage critical: ${usage}%${NC}"
        return 1
    elif [ "$usage" -gt 80 ]; then
        echo -e "${YELLOW}⚠️  Disk usage high: ${usage}%${NC}"
    else
        echo -e "${GREEN}✅ Disk usage OK: ${usage}%${NC}"
    fi
    return 0
}

# Function to check memory
check_memory() {
    local available
    local total
    
    available=$(free -m | awk 'NR==2{print $7}')
    total=$(free -m | awk 'NR==2{print $2}')
    
    local percentage=$((100 - (available * 100 / total)))
    
    if [ "$percentage" -gt 90 ]; then
        echo -e "${RED}⚠️  Memory usage critical: ${percentage}%${NC}"
        return 1
    elif [ "$percentage" -gt 80 ]; then
        echo -e "${YELLOW}⚠️  Memory usage high: ${percentage}%${NC}"
    else
        echo -e "${GREEN}✅ Memory usage OK: ${percentage}%${NC}"
    fi
    return 0
}

# Function to check Docker containers
check_containers() {
    local failed=0
    
    echo -e "${YELLOW}📦 Checking Docker containers...${NC}"
    
    if ! docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "meteora"; then
        echo -e "${RED}❌ Meteora containers not running${NC}"
        failed=1
    else
        echo -e "${GREEN}✅ Containers running${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep meteora
    fi
    
    return $failed
}

# Function to restart services
restart_services() {
    echo -e "${YELLOW}🔄 Attempting to restart services...${NC}"
    
    # Restart with PM2
    if command -v pm2 &> /dev/null; then
        pm2 restart ecosystem.config.js --env production
    fi
    
    # Or restart with Docker
    if command -v docker-compose &> /dev/null; then
        cd /opt/meteora-ai-lp && docker-compose restart
    fi
    
    # Wait for services to start
    sleep 10
    
    # Check again
    if check_health; then
        echo -e "${GREEN}✅ Services restarted successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Services failed to restart${NC}"
        return 1
    fi
}

# Main check loop
main() {
    echo -e "${YELLOW}🔍 Running health checks...${NC}"
    echo "================================"
    
    local failed=0
    
    # Check application health
    echo -e "${YELLOW}🏥 Checking application health...${NC}"
    if check_health; then
        echo -e "${GREEN}✅ Application is healthy${NC}"
    else
        echo -e "${RED}❌ Application is not responding${NC}"
        failed=1
    fi
    
    # Check system resources
    echo -e "\n${YELLOW}💻 Checking system resources...${NC}"
    check_disk_space || failed=1
    check_memory || failed=1
    
    # Check containers
    if command -v docker &> /dev/null; then
        echo -e "\n${YELLOW}🐳 Checking Docker containers...${NC}"
        check_containers || failed=1
    fi
    
    echo "================================"
    
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✅ All health checks passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some health checks failed${NC}"
        
        # Attempt restart if AUTO_RESTART is set
        if [ "$AUTO_RESTART" == "true" ]; then
            restart_services
        fi
        
        exit 1
    fi
}

# Run once mode or continuous mode
if [ "$1" == "--watch" ]; then
    echo -e "${YELLOW}👁️  Running continuous health checks every ${CHECK_INTERVAL}s...${NC}"
    while true; do
        main
        sleep $CHECK_INTERVAL
    done
else
    main
fi
