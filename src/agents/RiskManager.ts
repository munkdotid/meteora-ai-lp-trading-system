// ==========================================
// RISK MANAGER AGENT
// Validates trades and enforces risk limits
// ==========================================

import { config } from '../config';
import { logger } from '../utils/logger';
import {
  TradeIntent,
  RiskAssessment,
  RiskWarning,
  RiskLevel,
  Position,
  CircuitBreakerType,
  RiskLimits,
} from '../types';

export class RiskManager {
  private currentExposure: number = 0;
  private positions: Map<string, Position> = new Map();
  private dailyPnL: number = 0;
  private startOfDayBalance: number = 0;
  private peakBalance: number = 0;
  private circuitBreakers: Set<CircuitBreakerType> = new Set();
  private lastCheck: Date = new Date();
  
  // ==========================================
  // RISK LIMITS CONFIGURATION
  // ==========================================
  
  private limits: RiskLimits = {
    maxPositions: config.trading.maxPositions,
    maxPerPool: config.trading.maxPerPool,
    dailyLossLimit: config.trading.dailyLossLimit,
    maxDrawdown: config.trading.maxDrawdown,
    minPoolTVL: config.trading.minPoolTVL,
    minVolume24h: config.trading.minVolume24h,
    maxVolatility: config.trading.maxVolatility,
    minPoolAgeHours: config.trading.minPoolAgeHours,
    stopLossPercentage: config.trading.stopLossPercentage,
    takeProfitPercentage: config.trading.takeProfitPercentage,
  };
  
  // ==========================================
  // MAIN VALIDATION FUNCTION
  // ==========================================
  
  async validateTrade(
    intent: TradeIntent,
    availableCapital: number,
    currentPositions: Position[]
  ): Promise<RiskAssessment> {
    logger.info(`🛡️ Risk Manager: Validating ${intent.type} trade`);
    
    const warnings: RiskWarning[] = [];
    let overallRisk: RiskLevel = 'low';
    let riskScore = 0;
    let positionSize = 0;
    let circuitBreaker: CircuitBreakerType | undefined;
    
    try {
      // Check global circuit breakers first
      const breakerCheck = this.checkCircuitBreakers(availableCapital);
      if (breakerCheck.triggered) {
        return {
          overallRisk: 'critical',
          riskScore: 100,
          warnings: [{
            type: 'circuit_breaker',
            severity: 'critical',
            message: `Circuit breaker active: ${breakerCheck.type}`,
          }],
          positionSize: 0,
          circuitBreaker: breakerCheck.type,
        };
      }
      
      // Validate based on trade type
      switch (intent.type) {
        case 'entry':
          const entryCheck = await this.validateEntry(
            intent,
            availableCapital,
            currentPositions
          );
          warnings.push(...entryCheck.warnings);
          riskScore = entryCheck.riskScore;
          positionSize = entryCheck.positionSize;
          break;
          
        case 'exit':
          const exitCheck = this.validateExit(intent, currentPositions);
          warnings.push(...exitCheck.warnings);
          riskScore = exitCheck.riskScore;
          positionSize = 0; // Exit doesn't add exposure
          break;
          
        case 'rebalance':
          const rebalanceCheck = this.validateRebalance(intent, currentPositions);
          warnings.push(...rebalanceCheck.warnings);
          riskScore = rebalanceCheck.riskScore;
          positionSize = 0; // Rebalance maintains exposure
          break;
      }
      
      // Determine overall risk level
      overallRisk = this.determineRiskLevel(riskScore, warnings);
      
      // Adjust position size based on risk
      positionSize = this.adjustPositionSize(positionSize, riskScore);
      
      // Add general warnings
      const generalWarnings = this.generateGeneralWarnings(
        currentPositions,
        availableCapital
      );
      warnings.push(...generalWarnings);
      
      logger.info(`✅ Risk assessment complete - Risk: ${overallRisk}, Score: ${riskScore}`);
      
      return {
        overallRisk,
        riskScore,
        warnings,
        positionSize,
        circuitBreaker,
      };
      
    } catch (error) {
      logger.error('❌ Risk Manager: Validation failed', error);
      return {
        overallRisk: 'critical',
        riskScore: 100,
        warnings: [{
          type: 'validation_error',
          severity: 'critical',
          message: `Validation error: ${error.message}`,
        }],
        positionSize: 0,
      };
    }
  }
  
  // ==========================================
  // ENTRY VALIDATION
  // ==========================================
  
  private async validateEntry(
    intent: TradeIntent,
    availableCapital: number,
    currentPositions: Position[]
  ): Promise<{ warnings: RiskWarning[]; riskScore: number; positionSize: number }> {
    const warnings: RiskWarning[] = [];
    let riskScore = 0;
    
    // Check position count
    if (currentPositions.length >= this.limits.maxPositions) {
      warnings.push({
        type: 'max_positions',
        severity: 'critical',
        message: `Maximum positions (${this.limits.maxPositions}) reached`,
      });
      riskScore += 30;
    }
    
    // Check total exposure
    const totalExposure = currentPositions.reduce((sum, p) => sum + p.investment.usd, 0);
    const maxTotalExposure = availableCapital * (1 - config.trading.cashReserve);
    
    if (totalExposure >= maxTotalExposure) {
      warnings.push({
        type: 'max_exposure',
        severity: 'critical',
        message: `Maximum exposure reached: $${totalExposure.toFixed(2)}`,
      });
      riskScore += 30;
    }
    
    // Check for duplicate pool
    const existingPosition = currentPositions.find(p => p.poolAddress === intent.poolAddress);
    if (existingPosition) {
      warnings.push({
        type: 'duplicate_pool',
        severity: 'warning',
        message: `Already have position in this pool`,
      });
      riskScore += 15;
    }
    
    // Check correlated positions
    const correlatedExposure = this.calculateCorrelatedExposure(
      intent.poolAddress,
      currentPositions
    );
    if (correlatedExposure > 0.4) {
      warnings.push({
        type: 'correlated_exposure',
        severity: 'warning',
        message: `Correlated exposure: ${(correlatedExposure * 100).toFixed(0)}%`,
      });
      riskScore += 10;
    }
    
    // Calculate position size
    let positionSize = intent.amount || this.limits.maxPerPool;
    
    // Limit by remaining exposure capacity
    const remainingCapacity = maxTotalExposure - totalExposure;
    const maxPositionByCapacity = remainingCapacity / availableCapital;
    positionSize = Math.min(positionSize, maxPositionByCapacity);
    
    // Limit by max per pool
    positionSize = Math.min(positionSize, this.limits.maxPerPool);
    
    // Check daily loss
    if (this.dailyPnL < -this.limits.dailyLossLimit * availableCapital) {
      warnings.push({
        type: 'daily_loss',
        severity: 'critical',
        message: `Daily loss limit approaching: $${this.dailyPnL.toFixed(2)}`,
      });
      riskScore += 25;
      positionSize *= 0.5; // Reduce size
    }
    
    return { warnings, riskScore, positionSize };
  }
  
  // ==========================================
  // EXIT VALIDATION
  // ==========================================
  
  private validateExit(
    intent: TradeIntent,
    currentPositions: Position[]
  ): { warnings: RiskWarning[]; riskScore: number } {
    const warnings: RiskWarning[] = [];
    let riskScore = 0;
    
    const position = currentPositions.find(p => p.id === intent.positionId);
    
    if (!position) {
      warnings.push({
        type: 'position_not_found',
        severity: 'critical',
        message: `Position ${intent.positionId} not found`,
      });
      riskScore = 100;
      return { warnings, riskScore };
    }
    
    // Check if exit makes sense
    if (position.status === 'closing') {
      warnings.push({
        type: 'already_closing',
        severity: 'info',
        message: 'Position is already being closed',
      });
    }
    
    // Warn about negative PnL
    if (position.pnl.unrealized < 0) {
      warnings.push({
        type: 'negative_pnl',
        severity: 'warning',
        message: `Exit with negative PnL: $${position.pnl.unrealized.toFixed(2)}`,
      });
    }
    
    return { warnings, riskScore };
  }
  
  // ==========================================
  // REBALANCE VALIDATION
  // ==========================================
  
  private validateRebalance(
    intent: TradeIntent,
    currentPositions: Position[]
  ): { warnings: RiskWarning[]; riskScore: number } {
    const warnings: RiskWarning[] = [];
    let riskScore = 10; // Base risk for rebalance
    
    const position = currentPositions.find(p => p.id === intent.positionId);
    
    if (!position) {
      warnings.push({
        type: 'position_not_found',
        severity: 'critical',
        message: `Position ${intent.positionId} not found`,
      });
      riskScore = 100;
      return { warnings, riskScore };
    }
    
    // Check rebalance frequency
    if (position.lastRebalance) {
      const hoursSinceRebalance = (Date.now() - position.lastRebalance.getTime()) / (1000 * 60 * 60);
      if (hoursSinceRebalance < 1) {
        warnings.push({
          type: 'frequent_rebalance',
          severity: 'warning',
          message: `Rebalanced ${hoursSinceRebalance.toFixed(1)} hours ago`,
        });
        riskScore += 10;
      }
    }
    
    // Gas cost warning
    warnings.push({
      type: 'rebalance_cost',
      severity: 'info',
      message: 'Rebalance incurs gas costs and potential slippage',
    });
    
    return { warnings, riskScore };
  }
  
  // ==========================================
  // CIRCUIT BREAKERS
  // ==========================================
  
  private checkCircuitBreakers(availableCapital: number): { triggered: boolean; type?: CircuitBreakerType } {
    // Daily loss limit
    const dailyLossPct = -this.dailyPnL / this.startOfDayBalance;
    if (dailyLossPct >= this.limits.dailyLossLimit) {
      this.circuitBreakers.add('daily_loss_limit');
      logger.error(`🚨 CIRCUIT BREAKER: Daily loss limit ${(dailyLossPct * 100).toFixed(1)}%`);
      return { triggered: true, type: 'daily_loss_limit' };
    }
    
    // Max drawdown
    if (this.peakBalance > 0) {
      const drawdown = (this.peakBalance - availableCapital) / this.peakBalance;
      if (drawdown >= this.limits.maxDrawdown) {
        this.circuitBreakers.add('max_drawdown');
        logger.error(`🚨 CIRCUIT BREAKER: Max drawdown ${(drawdown * 100).toFixed(1)}%`);
        return { triggered: true, type: 'max_drawdown' };
      }
    }
    
    return { triggered: false };
  }
  
  // ==========================================
  // EXPOSURE CALCULATIONS
  // ==========================================
  
  private calculateCorrelatedExposure(
    poolAddress: string,
    currentPositions: Position[]
  ): number {
    // Simplified correlation check
    // In production, use correlation matrix
    let correlatedUSD = 0;
    const totalUSD = currentPositions.reduce((sum, p) => sum + p.investment.usd, 0);
    
    if (totalUSD === 0) return 0;
    
    // Check for same token pairs (high correlation)
    for (const position of currentPositions) {
      if (position.poolAddress === poolAddress) {
        correlatedUSD += position.investment.usd;
      }
    }
    
    return correlatedUSD / totalUSD;
  }
  
  // ==========================================
  // RISK LEVEL DETERMINATION
  // ==========================================
  
  private determineRiskLevel(riskScore: number, warnings: RiskWarning[]): RiskLevel {
    // Check for critical warnings
    const hasCritical = warnings.some(w => w.severity === 'critical');
    if (hasCritical) return 'critical';
    
    // Score-based
    if (riskScore >= 70) return 'high';
    if (riskScore >= 40) return 'medium';
    return 'low';
  }
  
  // ==========================================
  // POSITION SIZE ADJUSTMENT
  // ==========================================
  
  private adjustPositionSize(size: number, riskScore: number): number {
    if (riskScore >= 80) return 0;
    if (riskScore >= 60) return size * 0.5;
    if (riskScore >= 40) return size * 0.75;
    return size;
  }
  
  // ==========================================
  // GENERAL WARNINGS
  // ==========================================
  
  private generateGeneralWarnings(
    currentPositions: Position[],
    availableCapital: number
  ): RiskWarning[] {
    const warnings: RiskWarning[] = [];
    
    // Low cash reserve
    const totalExposure = currentPositions.reduce((sum, p) => sum + p.investment.usd, 0);
    const cashReserve = (availableCapital - totalExposure) / availableCapital;
    
    if (cashReserve < 0.05) {
      warnings.push({
        type: 'low_cash_reserve',
        severity: 'warning',
        message: `Low cash reserve: ${(cashReserve * 100).toFixed(1)}%`,
      });
    }
    
    return warnings;
  }
  
  // ==========================================
  // STATE UPDATES
  // ==========================================
  
  updatePosition(position: Position): void {
    this.positions.set(position.id, position);
    this.currentExposure = Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.investment.usd, 0);
  }
  
  removePosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (position) {
      this.currentExposure -= position.investment.usd;
      this.positions.delete(positionId);
    }
  }
  
  updatePnL(realizedPnL: number): void {
    this.dailyPnL += realizedPnL;
  }
  
  updateBalance(balance: number): void {
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
  }
  
  resetCircuitBreaker(type: CircuitBreakerType): void {
    this.circuitBreakers.delete(type);
    logger.info(`🔄 Circuit breaker reset: ${type}`);
  }
  
  resetDailyStats(): void {
    this.dailyPnL = 0;
    this.startOfDayBalance = this.currentExposure;
    this.circuitBreakers.clear();
    logger.info('🔄 Daily stats reset');
  }
  
  // ==========================================
  // GETTERS
  // ==========================================
  
  getCurrentExposure(): number {
    return this.currentExposure;
  }
  
  getDailyPnL(): number {
    return this.dailyPnL;
  }
  
  getActiveCircuitBreakers(): CircuitBreakerType[] {
    return Array.from(this.circuitBreakers);
  }
  
  isCircuitBreakerActive(type: CircuitBreakerType): boolean {
    return this.circuitBreakers.has(type);
  }
  
  getLimits(): RiskLimits {
    return { ...this.limits };
  }
}

export default RiskManager;
