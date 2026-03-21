#!/bin/bash
# ==========================================
# Database Backup Script for Ubuntu
# ==========================================

set -e

# Configuration
BACKUP_DIR="/opt/meteora-ai-lp/backups"
DB_NAME="meteora_bot"
DB_USER="meteora_user"
DB_HOST="db"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="meteora_backup_${DATE}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}[$(date +%Y-%m-%d\ %H:%M:%S)] Starting database backup...${NC}"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Backup database
echo -e "${YELLOW}Creating database dump...${NC}"
if PGPASSWORD=${DB_PASSWORD:-meteora_pass} pg_dump -h ${DB_HOST} -U ${DB_USER} ${DB_NAME} | gzip > ${BACKUP_DIR}/${BACKUP_FILE}; then
    echo -e "${GREEN}✅ Backup created: ${BACKUP_FILE}${NC}"
    
    # Get file size
    SIZE=$(du -h ${BACKUP_DIR}/${BACKUP_FILE} | cut -f1)
    echo -e "${GREEN}   Size: ${SIZE}${NC}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi

# Cleanup old backups
echo -e "${YELLOW}Cleaning up old backups (retention: ${RETENTION_DAYS} days)...${NC}"
DELETED=$(find ${BACKUP_DIR} -name "meteora_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo -e "${GREEN}✅ Removed ${DELETED} old backup(s)${NC}"

# List current backups
echo -e "${YELLOW}Current backups:${NC}"
ls -lh ${BACKUP_DIR}/meteora_backup_*.sql.gz 2>/dev/null | tail -5 || echo "   No backups found"

# Upload to S3 if configured (optional)
if [ ! -z "$BACKUP_S3_BUCKET" ]; then
    echo -e "${YELLOW}Uploading to S3...${NC}"
    if aws s3 cp ${BACKUP_DIR}/${BACKUP_FILE} s3://${BACKUP_S3_BUCKET}/backups/; then
        echo -e "${GREEN}✅ Uploaded to S3${NC}"
    else
        echo -e "${RED}❌ S3 upload failed${NC}"
    fi
fi

echo -e "${GREEN}[$(date +%Y-%m-%d\ %H:%M:%S)] Backup complete!${NC}"
