# ✅ Ubuntu Compatibility Checklist
# AI LP Trading System

This document confirms all files are compatible with Ubuntu Linux.

---

## 📋 Compatibility Status

### ✅ Core Files

| File | Ubuntu Compatible | Notes |
|------|-------------------|-------|
| `package.json` | ✅ Yes | Standard Node.js, cross-platform |
| `tsconfig.json` | ✅ Yes | TypeScript config, platform-agnostic |
| `Dockerfile` | ✅ Yes | Uses Alpine Linux base |
| `docker-compose.yml` | ✅ Yes | Linux containers |
| `ecosystem.config.js` | ✅ Yes | PM2 config, works on Linux |
| `Makefile` | ✅ Yes | GNU Make syntax |
| `.nvmrc` | ✅ Yes | Node version file |
| `.env.example` | ✅ Yes | Environment template |
| `.gitignore` | ✅ Yes | Git ignore patterns |
| `.dockerignore` | ✅ Yes | Docker ignore patterns |

### ✅ Scripts

| Script | Ubuntu Compatible | Notes |
|--------|-------------------|-------|
| `scripts/setup-ubuntu.sh` | ✅ Yes | Designed for Ubuntu |
| `scripts/backup.sh` | ✅ Yes | Bash script, POSIX compliant |
| `scripts/health-check.sh` | ✅ Yes | Uses standard Linux tools |
| `scripts/deploy.sh` | ✅ Yes | Deployment automation |

### ✅ Configuration

| File | Ubuntu Compatible | Notes |
|------|-------------------|-------|
| `nginx/nginx.conf` | ✅ Yes | Standard Nginx config |
| `prisma/schema.prisma` | ✅ Yes | Database schema |

### ✅ Source Code

| Directory | Ubuntu Compatible | Notes |
|-----------|-------------------|-------|
| `src/agents/` | ✅ Yes | TypeScript, cross-platform |
| `src/config/` | ✅ Yes | Configuration module |
| `src/types/` | ✅ Yes | Type definitions |
| `src/utils/` | ✅ Yes | Utilities |

---

## 🔧 Ubuntu-Specific Features

### 1. Systemd Service
The setup script creates `/etc/systemd/system/meteora-ai-lp.service`:

```ini
[Unit]
Description=AI LP Trading System
After=network.target

[Service]
Type=forking
User=deploy
WorkingDirectory=/opt/meteora-ai-lp
ExecStart=/usr/local/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/local/bin/pm2 reload ecosystem.config.js --env production
ExecStop=/usr/local/bin/pm2 stop ecosystem.config.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### 2. Log Rotation
Configured at `/etc/logrotate.d/meteora-ai-lp`:

```
/opt/meteora-ai-lp/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 deploy deploy
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 3. Firewall (UFW)
Automatic configuration:

```bash
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 3000/tcp    # App port
sudo ufw allow 3001/tcp    # Health check port
sudo ufw --force enable
```

### 4. Swap Space
Auto-created if missing:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## 🐳 Docker Compatibility

### Verified Images
All Docker images support Linux/AMD64:

| Image | Platform | Status |
|-------|----------|--------|
| `node:20-alpine` | Linux | ✅ Verified |
| `postgres:15-alpine` | Linux | ✅ Verified |
| `redis:7-alpine` | Linux | ✅ Verified |
| `nginx:alpine` | Linux | ✅ Verified |
| `prom/prometheus:latest` | Linux | ✅ Verified |
| `grafana/grafana:latest` | Linux | ✅ Verified |

### Docker Compose Version
Requires Docker Compose v2.20+ (included in Docker Desktop and modern Docker installs).

---

## 📝 Path Conventions

### Linux Paths (Used in Scripts)

| Purpose | Path |
|---------|------|
| Application root | `/opt/meteora-ai-lp` |
| Logs | `/opt/meteora-ai-lp/logs` |
| Secrets | `/opt/meteora-ai-lp/secrets` |
| Backups | `/opt/meteora-ai-lp/backups` |
| Nginx config | `/opt/meteora-ai-lp/nginx/nginx.conf` |
| SSL certs | `/opt/meteora-ai-lp/nginx/ssl/` |
| Systemd service | `/etc/systemd/system/meteora-ai-lp.service` |
| Logrotate config | `/etc/logrotate.d/meteora-ai-lp` |

---

## 🔒 Permission Model

### User Setup
- **Service user**: `deploy` (non-root)
- **Group**: `deploy`
- **Home**: `/home/deploy`
- **App dir**: `/opt/meteora-ai-lp` (owned by deploy:deploy)

### File Permissions

```bash
# Application files
chmod 755 /opt/meteora-ai-lp
chmod 600 /opt/meteora-ai-lp/.env
chmod 700 /opt/meteora-ai-lp/secrets
chmod 600 /opt/meteora-ai-lp/secrets/*
chmod +x /opt/meteora-ai-lp/scripts/*.sh

# Nginx SSL
chmod 700 /opt/meteora-ai-lp/nginx/ssl
chmod 600 /opt/meteora-ai-lp/nginx/ssl/*.pem
```

---

## 🧪 Tested On

| Ubuntu Version | Architecture | Status | Notes |
|----------------|--------------|--------|-------|
| Ubuntu 20.04 LTS | x64 | ✅ Verified | Focal Fossa |
| Ubuntu 22.04 LTS | x64 | ✅ Verified | Jammy Jellyfish |
| Ubuntu 22.04 LTS | ARM64 | ✅ Compatible | Apple Silicon, Raspberry Pi |

---

## ⚠️ Known Limitations

### 1. Windows Path Issues (Not Applicable)
All file paths in scripts use Linux conventions (`/` not `\`).

### 2. Line Endings
All shell scripts use LF line endings (Unix format).

### 3. Executable Permissions
Shell scripts have executable permissions:
```bash
chmod +x scripts/*.sh
```

---

## 🚀 Quick Verification

Run this command to verify Ubuntu compatibility:

```bash
cd /opt/meteora-ai-lp

# Check file permissions
ls -la scripts/

# Check line endings
file scripts/setup-ubuntu.sh
# Expected: Bourne-Again shell script, ASCII text executable

# Verify Docker
docker --version
docker-compose --version

# Check Node.js
node --version  # Should be v20.x.x

# Verify PM2
pm2 --version

# Check Nginx
nginx -v
```

---

## 📦 Installation Test

```bash
# 1. Clone repository
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git
cd meteora-ai-lp-trading-system

# 2. Run setup
chmod +x scripts/setup-ubuntu.sh
sudo ./scripts/setup-ubuntu.sh

# 3. Configure environment
cp .env.example .env
nano .env

# 4. Install dependencies
make install

# 5. Build
make build

# 6. Test health check
make health-check

# 7. Start (choose one)
make pm2-start      # Production mode
# OR
make docker-up      # Docker mode
```

---

## ✅ Final Checklist

Before deploying to Ubuntu, verify:

- [ ] Ubuntu 20.04+ or 22.04+
- [ ] Node.js 20.x installed via NVM
- [ ] Docker 24+ and Docker Compose 2.20+
- [ ] PM2 installed globally
- [ ] PostgreSQL 15+ (local or Docker)
- [ ] Redis 7+ (local or Docker)
- [ ] Nginx (for reverse proxy)
- [ ] SSL certificates (for HTTPS)
- [ ] Firewall configured (UFW)
- [ ] Swap space configured (4GB+)
- [ ] Timezone set to UTC
- [ ] Log rotation configured
- [ ] Systemd service enabled
- [ ] `.env` file configured
- [ ] Private keys secured (chmod 600)

---

## 🆘 Troubleshooting

### Permission Denied
```bash
# Fix ownership
sudo chown -R $USER:$USER /opt/meteora-ai-lp

# Fix script permissions
chmod +x scripts/*.sh
```

### Line Ending Issues (from Windows)
```bash
# Convert CRLF to LF
sudo apt-get install -y dos2unix
dos2unix scripts/*.sh
```

### Docker Permission Denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Node.js Not Found
```bash
# Source NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

---

## 📞 Support

For Ubuntu-specific issues:
1. Check `UBUNTU_SETUP.md` for detailed instructions
2. Run `make health-check` for diagnostics
3. Check logs: `make logs`
4. Review `SERVICES_IMPLEMENTATION.md` for service status

---

**Compatibility Status:** ✅ **FULLY COMPATIBLE WITH UBUNTU**

**Last Verified:** 2026-03-21
