# 🖥️ Windows Deployment Guide - Meteora AI LP Trading System

Panduan lengkap deployment ke Windows (development/testing environment).

---

## ⚠️ IMPORTANT NOTICE

**Recommended for:** Development & Testing only  
**Production:** Gunakan Ubuntu VPS untuk 24/7 operation

Windows cocok untuk:
- ✅ Development & testing
- ✅ Code editing & debugging  
- ✅ Learning & experimentation
- ❌ Production trading (not recommended)

---

## 📋 Prerequisites

### Minimum Requirements
- Windows 10/11 Pro atau Enterprise
- 8GB RAM (16GB recommended)
- 50GB free disk space
- Internet connection

### Software yang Dibutuhkan
1. Git for Windows
2. Node.js 20+ dengan npm
3. Docker Desktop
4. VS Code (recommended)
5. Windows Terminal (optional)

---

## 🚀 Step-by-Step Installation

### **Step 1: Install Prerequisites (30 menit)**

#### **A. Install Git for Windows**
```powershell
# Download dari:
https://git-scm.com/download/win

# Install dengan default settings
# Pastikan "Git Bash" terinstall
```

#### **B. Install Node.js 20**
```powershell
# Download dari:
https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi

# Verify installation:
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install Windows Build Tools (jika perlu native modules)
npm install -g windows-build-tools
```

#### **C. Install Docker Desktop**
```powershell
# Download dari:
https://www.docker.com/products/docker-desktop

# Install dan restart Windows
# Enable WSL2 backend saat setup

# Verify:
docker --version
```

#### **D. Install VS Code (Optional tapi Recommended)**
```powershell
# Download dari:
https://code.visualstudio.com/download

# Extensions yang berguna:
# - ESLint
# - Prettier
# - Docker
# - TypeScript Importer
# - Error Lens
```

---

### **Step 2: Clone Repository (5 menit)**

```powershell
# Buat folder project
mkdir C:\meteora_bot
cd C:\meteora_bot

# Clone dari GitHub
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git .

# Atau jika pakai token:
git clone https://YOUR_TOKEN@github.com/munkdotid/meteora-ai-lp-trading-system.git .
```

---

### **Step 3: Setup Environment (10 menit)**

#### **A. Copy Environment File**
```powershell
# Copy template
copy .env.example .env

# Edit dengan VS Code atau notepad
code .env
# atau
notepad .env
```

#### **B. Configure .env untuk Windows**
```bash
# Edit file .env dengan nilai berikut:

# ============================================
# WINDOWS DEVELOPMENT CONFIG
# ============================================

# Node Environment
NODE_ENV=development

# Solana Network (gunakan devnet untuk testing!)
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# IMPORTANT: Gunakan devnet untuk testing!
# Jangan gunakan mainnet tanpa testing dulu

# Wallet Configuration
# Option 1: Private key (hati-hati!)
SOLANA_WALLET_PRIVATE_KEY=your_devnet_wallet_private_key

# Option 2: Key file path (Windows path)
# WALLET_KEY_PATH=C:\meteora_bot\secrets\wallet.json

# IMPORTANT: Create secrets folder
# mkdir secrets
# echo {\"your\":\"wallet\",\"json\":\"here\"} > secrets\wallet.json

# Database (akan pakai Docker)
DATABASE_URL=postgresql://meteora:password@localhost:5432/meteora_bot
REDIS_URL=redis://localhost:6379

# Telegram (opsional untuk testing)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret
AUTHORIZED_USERS=your_telegram_user_id

# Trading Settings (SAFE untuk dev)
DRY_RUN=true
MAX_POSITIONS=1
MAX_POSITION_PERCENTAGE=0.05
MIN_CONFIDENCE=0.75

# Meteora Settings
METEORA_API_KEY=your_meteora_api_key

# Jupiter Settings  
JUPITER_API_KEY=your_jupiter_api_key

# Logging
LOG_LEVEL=debug
LOG_FILE=logs/app.log

# Dev mode - disable production features
DISABLE_TELEGRAM=true
DISABLE_NOTIFICATIONS=true
```

#### **C. Create Required Folders**
```powershell
# Buat folder yang dibutuhkan
mkdir logs
mkdir secrets
mkdir data

# Set permissions (PowerShell admin)
# Folder secrets hanya untuk user ini
$path = "C:\meteora_bot\secrets"
$acl = Get-Acl $path

# Remove all access
$acl.SetAccessRuleProtection($true, $false)

# Add current user only
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($rule)
Set-Acl $path $acl
```

---

### **Step 4: Install Dependencies (10-15 menit)**

```powershell
cd C:\meteora_bot

# Install npm dependencies
npm install

# Jika ada error dengan native modules, coba:
npm install --force

# Atau rebuild
npm rebuild

# Install TypeScript compiler secara global
npm install -g typescript

# Verify prisma
npx prisma --version
```

**Troubleshooting dependency issues:**
```powershell
# Clear cache jika ada masalah
npm cache clean --force
rm -rf node_modules
rm package-lock.json
npm install
```

---

### **Step 5: Setup Database dengan Docker (10 menit)**

#### **A. Start Docker Desktop**
- Buka Docker Desktop dari Start Menu
- Tunggu sampai status "Docker Desktop is running"
- Enable WSL2 integration untuk Ubuntu

#### **B. Create Docker Compose untuk Windows**
```powershell
# File: docker-compose.dev.yml sudah ada di project
# Edit jika perlu, lalu jalankan:

docker-compose -f docker-compose.dev.yml up -d

# Verify containers running
docker ps

# Should show:
# - postgres container
# - redis container
```

#### **C. Setup Database Schema**
```powershell
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Atau jika production database:
npx prisma migrate deploy

# Seed database (optional)
npx prisma db seed

# Verify dengan Prisma Studio (GUI)
npx prisma studio
# Buka http://localhost:5555
```

---

### **Step 6: Build Application (5 menit)**

```powershell
cd C:\meteora_bot

# Compile TypeScript
npm run build

# Verify build success
# Should create dist/ folder
dir dist\

# Jika error, check:
npm run typecheck
```

---

### **Step 7: Testing - DRY RUN Mode (WAJIB!)**

#### **A. Start in DRY RUN Mode**
```powershell
# Set environment
cd C:\meteora_bot
$env:DRY_RUN="true"
$env:NODE_ENV="development"
$env:LOG_LEVEL="debug"

# Start application
npm start

# Atau dengan hot reload untuk development
npm run dev
```

#### **B. Verify DRY RUN Working**
```powershell
# Buka log file
type logs\app.log

# Atau tail log secara real-time
Get-Content logs\app.log -Wait -Tail 50

# Cari pesan:
# "🧪 DRY RUN MODE - No real transactions"
# "⚠️  DRY RUN: Would have swapped X for Y"
```

#### **C. Run for Minimum 2 Hours**
```powershell
# Biarkan berjalan minimal 2 jam
# Verifikasi:
# - No errors
# - Pools scanned
# - Decisions made (but no real trades)
# - Logs rotating
```

---

### **Step 8: Test dengan Small Live Trade (Opsional)**

**⚠️ WARNING: Only on devnet!**

```powershell
# Switch ke devnet (sudah di .env)
# Pastikan wallet punya devnet SOL:
# https://faucet.solana.com/

# Disable DRY_RUN untuk test
$env:DRY_RUN="false"
$env:MAX_POSITIONS="1"
$env:MAX_POSITION_PERCENTAGE="0.10"

# Start
cd C:\meteora_bot
npm start

# Monitor untuk 1 hari dengan:
# - 1 position only
# - 10% max allocation
# - Devnet only
```

---

## 🛠️ Development Workflow

### **Hot Reload Development**
```powershell
# Terminal 1: Run dengan hot reload
npm run dev

# Terminal 2: Watch logs
Get-Content logs\app.log -Wait -Tail 20

# Terminal 3: Database GUI
npx prisma studio
```

### **Debug dengan VS Code**
1. Buka project di VS Code
2. Press F5 atau click "Run and Debug"
3. Select "Node.js" configuration
4. Set breakpoints di code
5. Debug aplikasi secara real-time

### **Testing Commands**
```powershell
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

---

## 🔧 Windows-Specific Configurations

### **PowerShell Profile Setup**
```powershell
# Edit profile
notepad $PROFILE

# Add aliases:
function meteora { cd C:\meteora_bot }
function meteora-logs { Get-Content C:\meteora_bot\logs\app.log -Wait -Tail 50 }
function meteora-start { cd C:\meteora_bot; npm start }
```

### **Task Scheduler untuk Auto-Start**
```powershell
# Create scheduled task untuk auto-start (optional)
# Hati-hati: Hanya untuk testing, bukan production!

$action = New-ScheduledTaskAction -Execute "npm" -Argument "start" -WorkingDirectory "C:\meteora_bot"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName "MeteoraBot" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
```

---

## 🚨 Troubleshooting Windows

### **Issue 1: "Cannot find module"**
```powershell
# Solusi:
npm install
npm run build

# Atau rebuild native modules
npm rebuild

# Clear cache
npm cache clean --force
rm -rf node_modules
npm install
```

### **Issue 2: Docker tidak jalan**
```powershell
# Enable WSL2
wsl --install
wsl --set-default-version 2

# Restart Docker Desktop
# Settings → Use the WSL2 based engine
```

### **Issue 3: Permission denied**
```powershell
# Run PowerShell as Administrator
# Set execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Fix folder permissions
icacls "C:\meteora_bot" /grant "$env:USERNAME:(OI)(CI)F" /T
```

### **Issue 4: Prisma tidak connect**
```powershell
# Cek Docker running
docker ps

# Restart containers
docker-compose -f docker-compose.dev.yml restart

# Cek port
netstat -an | findstr 5432
netstat -an | findstr 6379
```

### **Issue 5: TypeScript compile error**
```powershell
# Rebuild TypeScript
npm run clean
npm run build

# Check TypeScript version
npx tsc --version

# Force type check
npx tsc --noEmit
```

---

## 🔄 Maintenance Windows

### **Daily**
```powershell
# Check logs
Get-Content logs\app.log -Tail 100

# Check disk space
dir C:\meteora_bot

# Backup database
copy data\postgres\* D:\backup\
```

### **Weekly**
```powershell
# Update dependencies
npm update

# Rebuild
npm run build

# Clear old logs
# Logs auto-rotate via winston
```

### **Monthly**
```powershell
# Full system update
# Windows Update
# Docker Desktop update
# Node.js update (check LTS)
```

---

## 🎯 Next Steps

Setelah Windows setup berhasil:

1. **Test DRY_RUN** (minimal 2 jam) ✅
2. **Test Devnet** (1 hari, small amount) ✅
3. **Code Review** - Pastikan semua OK
4. **Deploy ke Ubuntu VPS** untuk production

**Untuk production deployment:**
- Baca: `INSTALLATION_MANUAL.md`
- Baca: `UBUNTU_SETUP.md`
- Gunakan: `scripts/quick-install.sh`

---

## 📚 Resources

- **GitHub:** https://github.com/munkdotid/meteora-ai-lp-trading-system
- **Solana Devnet Faucet:** https://faucet.solana.com/
- **Meteora Docs:** https://docs.meteora.ag/
- **Jupiter Docs:** https://station.jup.ag/

---

**🎉 Selamat! Windows development environment sudah siap! 🎉**
