# 🚀 Windows Quickstart Guide

**Get Meteora AI LP Trading System running on Windows in 30 minutes**

---

## ⚡ 5-Minute Setup (Automated)

### **Option 1: PowerShell Script (Recommended)**

```powershell
# 1. Open PowerShell as Administrator
# Right-click PowerShell → "Run as Administrator"

# 2. Set execution policy (one-time)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Run setup script
cd C:\meteora_bot
.\scripts\setup-windows.ps1

# 4. Follow prompts
# Script will:
# - Check prerequisites
# - Install dependencies  
# - Setup environment
# - Build application
# - Configure database
```

### **Option 2: Batch File**

```batch
# 1. Open Command Prompt as Administrator

# 2. Run setup
cd C:\meteora_bot
scripts\setup-windows.bat

# 3. Follow prompts
```

---

## 📋 Manual Setup (30 minutes)

### **Step 1: Install Prerequisites**

| Software | Download | Install Time |
|----------|----------|--------------|
| **Node.js 20** | [nodejs.org](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi) | 5 min |
| **Git** | [git-scm.com](https://git-scm.com/download/win) | 5 min |
| **Docker Desktop** | [docker.com](https://www.docker.com/products/docker-desktop) | 10 min |
| **VS Code** | [code.visualstudio.com](https://code.visualstudio.com/download) | 5 min |

**Verify installations:**
```powershell
node --version    # v20.x.x
npm --version     # 10.x.x
git --version     # 2.x.x
docker --version  # 24.x.x
```

---

### **Step 2: Clone & Setup**

```powershell
# Create project folder
mkdir C:\meteora_bot
cd C:\meteora_bot

# Clone repository
git clone https://github.com/munkdotid/meteora-ai-lp-trading-system.git .

# Or download ZIP and extract to C:\meteora_bot
```

---

### **Step 3: Configure Environment**

```powershell
# Copy Windows environment template
copy .env.windows.example .env

# Edit with Notepad or VS Code
notepad .env
# or
code .env
```

**Required changes in .env:**
```bash
# Use devnet for testing!
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Enable dry run for initial testing
DRY_RUN=true

# Get devnet SOL from: https://faucet.solana.com/
SOLANA_WALLET_PRIVATE_KEY=your_devnet_wallet_key
```

---

### **Step 4: Install & Build**

```powershell
# Install dependencies (10-15 minutes)
npm install

# Build TypeScript
npm run build

# Verify build
ls dist\  # Should show compiled JS files
```

---

### **Step 5: Start Database**

```powershell
# Start Docker Desktop first!
# Then run:
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Verify
docker ps

# Setup database schema
npx prisma migrate dev --name init
```

---

### **Step 6: Run Application**

```powershell
# Option A: Production mode
npm start

# Option B: Development with hot reload
npm run dev

# Option C: With debugging
# Press F5 in VS Code (select "Debug: Bot (Dry Run)")
```

---

## 🎯 Quick Commands Reference

```powershell
# Start application
npm start

# Development with hot reload
npm run dev

# Build only
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Database GUI
npx prisma studio

# View logs
Get-Content logs\app.log -Wait -Tail 50
# or
npm run logs

# Start Docker services
docker-compose -f docker-compose.dev.yml up -d

# Stop Docker services
docker-compose -f docker-compose.dev.yml down
```

---

## 🧪 Testing Checklist

### **Before First Run**
- [ ] DRY_RUN=true in .env
- [ ] Using devnet wallet
- [ ] Database containers running
- [ ] Build successful

### **During First Run (2 hours minimum)**
- [ ] No errors in console
- [ ] "DRY RUN" messages appearing
- [ ] Pools being scanned
- [ ] AI decisions being made
- [ ] Logs rotating correctly

### **After 2 Hours**
- [ ] Review logs\app.log
- [ ] Check no sensitive data exposed
- [ ] All features working as expected

---

## 🛠️ VS Code Integration

### **Launch Configurations (F5)**
- **Debug: Bot (Dry Run)** - Safe testing
- **Debug: Bot (Live - Devnet)** - Real trades on devnet
- **Debug: Test Suite** - Run tests
- **Debug: Prisma Studio** - Database GUI

### **Tasks (Ctrl+Shift+P → Run Task)**
- `npm: install` - Install dependencies
- `npm: build` - Build application
- `npm: start` - Start bot
- `npm: dev` - Start with hot reload
- `npm: test` - Run tests
- `docker: up` - Start database containers
- `logs: view` - View logs in real-time

---

## 🚨 Troubleshooting

### **"Cannot find module"**
```powershell
npm install
npm run build
```

### **"Permission denied"**
```powershell
# Run PowerShell as Administrator
# Or fix permissions:
icacls "C:\meteora_bot" /grant "%USERNAME%:(OI)(CI)F" /T
```

### **"Docker not running"**
```powershell
# Start Docker Desktop
# Wait for Docker Desktop is running
# Retry docker-compose command
```

### **"Port already in use"**
```powershell
# Check what's using port 3000
netstat -ano | findstr 3000

# Kill process or change port in .env
```

---

## 📁 Project Structure (Windows)

```
C:\meteora_bot\
├── .vscode\              # VS Code settings
│   ├── settings.json     # Editor settings
│   ├── launch.json       # Debug configs
│   ├── tasks.json        # Tasks
│   └── extensions.json   # Recommended extensions
├── logs\                # Log files
├── secrets\             # Wallet keys (secure)
├── data\                # Database files (Docker)
├── src\                 # Source code
├── dist\                # Compiled code
├── docker-compose.dev.yml  # Docker config
├── .env.windows.example    # Windows env template
├── WINDOWS_QUICKSTART.md   # This file
└── WINDOWS_DEPLOYMENT_GUIDE.md  # Full guide
```

---

## 🎯 Next Steps

### **After Windows Setup:**
1. ✅ **Test 2 hours in DRY_RUN mode**
2. ✅ **Review all logs for issues**
3. ✅ **Test small trades on devnet**
4. 🚀 **Deploy to Ubuntu VPS for production**

### **For Production:**
- Read: `INSTALLATION_MANUAL.md`
- Read: `UBUNTU_SETUP.md`
- Use: `scripts/setup-ubuntu.sh`

---

## 💡 Pro Tips

### **Windows Terminal**
Install Windows Terminal for better experience:
```powershell
# Install from Microsoft Store
# Or: winget install Microsoft.WindowsTerminal
```

### **PowerShell Profile**
Create aliases in `$PROFILE`:
```powershell
# Add to profile
function meteora { Set-Location C:\meteora_bot }
function meteora-start { Set-Location C:\meteora_bot; npm start }
function meteora-logs { Get-Content C:\meteora_bot\logs\app.log -Wait -Tail 50 }
```

### **Auto-start on Windows Login**
Use Task Scheduler (optional for development):
```powershell
# Create task to auto-start bot
# Or use PM2: pm2 start ecosystem.config.js
# pm2 startup windows
```

---

## 📚 Documentation

| Document | Use For |
|----------|---------|
| `WINDOWS_QUICKSTART.md` | This guide - 30-min setup |
| `WINDOWS_DEPLOYMENT_GUIDE.md` | Detailed Windows deployment |
| `INSTALLATION_MANUAL.md` | Ubuntu VPS production setup |
| `UBUNTU_SETUP.md` | Ubuntu server configuration |
| `README.md` | General overview |

---

## 🎉 Success!

**Your Windows development environment is ready!**

### **What You Can Do Now:**
- ✅ Code in VS Code with IntelliSense
- ✅ Debug with breakpoints
- ✅ Test with hot reload
- ✅ View real-time logs
- ✅ Manage database with GUI
- ✅ Run automated tests

### **Next:**
1. Start with `npm run dev`
2. Open browser to http://localhost:3000 (if API enabled)
3. Monitor logs
4. Code, test, iterate!

---

**Happy coding on Windows! 🖥️🚀**
