# ==========================================
# Makefile for AI LP Trading System
# Ubuntu/Linux Commands
# ==========================================

.PHONY: help install build dev start stop restart logs clean test lint docker-build docker-up docker-down docker-logs deploy setup-ubuntu

# Default target
.DEFAULT_GOAL := help

# Colors
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "${BLUE}AI LP Trading System - Available Commands:${NC}"
	@echo "=============================================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${GREEN}%-15s${NC} %s\n", $$1, $$2}'

# ==========================================
# Installation & Setup
# ==========================================

install: ## Install dependencies
	@echo "${YELLOW}📦 Installing dependencies...${NC}"
	npm install

setup-ubuntu: ## Run Ubuntu setup script (requires sudo)
	@echo "${YELLOW}🚀 Running Ubuntu setup...${NC}"
	chmod +x scripts/setup-ubuntu.sh
	./scripts/setup-ubuntu.sh

# ==========================================
# Development
# ==========================================

dev: ## Start development server with hot reload
	@echo "${GREEN}🚀 Starting development server...${NC}"
	npm run dev

build: ## Build TypeScript to JavaScript
	@echo "${YELLOW}🔨 Building TypeScript...${NC}"
	npm run build

lint: ## Run ESLint
	@echo "${YELLOW}🔍 Running linter...${NC}"
	npm run lint

test: ## Run tests
	@echo "${YELLOW}🧪 Running tests...${NC}"
	npm run test

test-watch: ## Run tests in watch mode
	@echo "${YELLOW}👁️  Running tests in watch mode...${NC}"
	npm run test:watch

# ==========================================
# Production
# ==========================================

start: build ## Start production server
	@echo "${GREEN}🚀 Starting production server...${NC}"
	npm start

pm2-start: build ## Start with PM2
	@echo "${GREEN}🚀 Starting with PM2...${NC}"
	npm run pm2:start

pm2-stop: ## Stop PM2 processes
	@echo "${YELLOW}🛑 Stopping PM2 processes...${NC}"
	npm run pm2:stop

pm2-restart: build ## Restart PM2 processes
	@echo "${GREEN}🔄 Restarting PM2 processes...${NC}"
	pm2 restart ecosystem.config.js --env production

pm2-logs: ## Show PM2 logs
	@echo "${BLUE}📋 Showing PM2 logs...${NC}"
	pm2 logs

pm2-monit: ## Monitor PM2 processes
	@echo "${BLUE}📊 Monitoring PM2 processes...${NC}"
	pm2 monit

pm2-status: ## Show PM2 status
	@echo "${BLUE}📊 PM2 Status:${NC}"
	pm2 status

# ==========================================
# Database
# ==========================================

db-generate: ## Generate Prisma client
	@echo "${YELLOW}🔄 Generating Prisma client...${NC}"
	npm run db:generate

db-migrate: ## Run database migrations
	@echo "${YELLOW}🔄 Running database migrations...${NC}"
	npm run db:migrate

db-studio: ## Open Prisma Studio (GUI)
	@echo "${GREEN}🎨 Opening Prisma Studio...${NC}"
	npm run db:studio

db-backup: ## Backup database
	@echo "${YELLOW}💾 Creating database backup...${NC}"
	chmod +x scripts/backup.sh
	./scripts/backup.sh

# ==========================================
# Docker
# ==========================================

docker-build: ## Build Docker images
	@echo "${YELLOW}🐳 Building Docker images...${NC}"
	npm run docker:build

docker-up: ## Start Docker containers
	@echo "${GREEN}🐳 Starting Docker containers...${NC}"
	npm run docker:up

docker-down: ## Stop Docker containers
	@echo "${YELLOW}🐳 Stopping Docker containers...${NC}"
	npm run docker:down

docker-logs: ## Show Docker logs
	@echo "${BLUE}🐳 Showing Docker logs...${NC}"
	npm run docker:logs

docker-ps: ## List Docker containers
	@echo "${BLUE}🐳 Docker containers:${NC}"
	docker-compose ps

docker-clean: ## Clean Docker (remove containers, volumes)
	@echo "${RED}⚠️  Cleaning Docker containers and volumes...${NC}"
	docker-compose down -v
	docker system prune -f

# ==========================================
# Utilities
# ==========================================

logs: ## Show application logs
	@echo "${BLUE}📋 Showing logs...${NC}"
	tail -f logs/application-*.log

health-check: ## Run health check
	@echo "${YELLOW}🏥 Running health check...${NC}"
	chmod +x scripts/health-check.sh
	./scripts/health-check.sh

health-watch: ## Run continuous health check
	@echo "${YELLOW}👁️  Running continuous health check...${NC}"
	chmod +x scripts/health-check.sh
	./scripts/health-check.sh --watch

stop: ## Stop all services
	@echo "${YELLOW}🛑 Stopping all services...${NC}"
	-pm2 stop ecosystem.config.js 2>/dev/null || true
	-docker-compose down 2>/dev/null || true

restart: stop start ## Restart all services

# ==========================================
# Deployment
# ==========================================

clean: ## Clean build artifacts
	@echo "${YELLOW}🧹 Cleaning build artifacts...${NC}"
	rm -rf dist
	rm -rf node_modules
	rm -rf logs/*.log
	rm -rf prisma/migrations/*_init
	@echo "${GREEN}✅ Clean complete${NC}"

reset: clean ## Full reset (clean + database)
	@echo "${RED}⚠️  Resetting database...${NC}"
	-docker-compose down -v 2>/dev/null || true
	rm -rf postgres_data
	@echo "${GREEN}✅ Reset complete${NC}"

# ==========================================
# Security
# ==========================================

permissions: ## Fix file permissions
	@echo "${YELLOW}🔒 Setting file permissions...${NC}"
	chmod +x scripts/*.sh
	chmod 600 .env 2>/dev/null || true
	chmod 700 secrets 2>/dev/null || true
	chmod 600 secrets/* 2>/dev/null || true
	@echo "${GREEN}✅ Permissions set${NC}"

# ==========================================
# Monitoring
# ==========================================

status: ## Show system status
	@echo "${BLUE}📊 System Status:${NC}"
	@echo ""
	@echo "${YELLOW}PM2 Processes:${NC}"
	-pm2 status 2>/dev/null || echo "PM2 not running"
	@echo ""
	@echo "${YELLOW}Docker Containers:${NC}"
	-docker-compose ps 2>/dev/null || echo "Docker not running"
	@echo ""
	@echo "${YELLOW}Disk Usage:${NC}"
	df -h /opt/meteora-ai-lp 2>/dev/null || df -h .
	@echo ""
	@echo "${YELLOW}Memory Usage:${NC}"
	free -h

# ==========================================
# Quick Commands
# ==========================================

quick-start: install build db-generate pm2-start ## Quick start (install + build + start)

dev-setup: install db-generate ## Setup for development
