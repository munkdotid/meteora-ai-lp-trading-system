// ==========================================
// ANALYST AGENT (AI Core)
// Deep pool analysis and strategy selection
// ==========================================

import { config } from '../config';
import { logger, aiLogger } from '../utils/logger';
import {
  Pool,
  PoolAnalysis,
  AIDecision,
  StrategyType,
  ActionType,
  Position,
} from '../types';
import { ScoutAgent } from './ScoutAgent';

export class AnalystAgent {
  private scoutAgent: ScoutAgent;
  private decisionHistory: AIDecision[] = [];
  
  constructor(scoutAgent: ScoutAgent) {
    this.scoutAgent = scoutAgent;
  }
  
  // ==========================================
  // MAIN ANALYSIS FUNCTION
  // ==========================================
  
  async analyzeOpportunity(poolAnalysis: PoolAnalysis): Promise<AIDecision> {
    const { pool, metrics, trend, opportunityScore } = poolAnalysis;
    
    logger.info(`🧠 Analyst Agent: Analyzing ${pool.tokenA.symbol}/${pool.tokenB.symbol}`);
    
    try {
      // Determine strategy
      const strategy = this.determineStrategy(pool, metrics, trend);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(pool, metrics, trend, opportunityScore);
      
      // Calculate expected APR
      const expectedAPR = this.projectAPR(pool, metrics, trend, strategy);
      
      // Assess risk
      const riskScore = this.assessRisk(pool, metrics, trend);
      
      // Determine optimal range
      const recommendedRange = this.calculateOptimalRange(pool, trend, strategy);
      
      // Calculate position size
      const positionSize = this.calculatePositionSize(confidence, riskScore, pool);
      
      // Generate reasoning
      const reasoning = this.generateReasoning(pool, metrics, trend, strategy, confidence);
      
      // Determine action
      const action = this.determineAction(pool, confidence, riskScore, opportunityScore);
      
      const decision: AIDecision = {
        id: this.generateDecisionId(),
        poolAddress: pool.address,
        action,
        strategy,
        confidence,
        expectedAPR,
        riskScore,
        reasoning,
        recommendedRange,
        positionSize,
        executed: false,
        timestamp: new Date(),
      };
      
      // Log decision
      aiLogger.info('AI Decision', {
        pool: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,
        action,
        strategy,
        confidence: `${(confidence * 100).toFixed(1)}%`,
        expectedAPR: `${(expectedAPR * 100).toFixed(1)}%`,
        riskScore,
      });
      
      this.decisionHistory.push(decision);
      
      // Trim history if too large
      if (this.decisionHistory.length > 1000) {
        this.decisionHistory = this.decisionHistory.slice(-500);
      }
      
      return decision;
      
    } catch (error) {
      logger.error(`❌ Analyst Agent: Analysis failed for ${pool.address}`, error);
      throw error;
    }
  }
  
  // ==========================================
  // STRATEGY SELECTION
  // ==========================================
  
  private determineStrategy(
    pool: Pool,
    metrics: PoolMetrics,
    trend: TrendAnalysis
  ): StrategyType {
    const weights = config.ai.strategyWeights;
    
    // Alpha strategy: Small cap, high volume, trending
    const alphaScore = this.calculateAlphaScore(pool, metrics, trend);
    
    // Range strategy: Sideways market, stable volatility
    const rangeScore = this.calculateRangeScore(pool, metrics, trend);
    
    // Momentum strategy: Strong trend, medium volatility
    const momentumScore = this.calculateMomentumScore(pool, metrics, trend);
    
    // Apply weights
    const weightedAlpha = alphaScore * weights.alpha;
    const weightedRange = rangeScore * weights.range;
    const weightedMomentum = momentumScore * weights.momentum;
    
    // Select best strategy
    const scores = [
      { strategy: 'alpha' as StrategyType, score: weightedAlpha },
      { strategy: 'range' as StrategyType, score: weightedRange },
      { strategy: 'momentum' as StrategyType, score: weightedMomentum },
    ];
    
    scores.sort((a, b) => b.score - a.score);
    
    logger.debug(`Strategy scores - Alpha: ${alphaScore.toFixed(2)}, Range: ${rangeScore.toFixed(2)}, Momentum: ${momentumScore.toFixed(2)}`);
    
    return scores[0].strategy;
  }
  
  private calculateAlphaScore(pool: Pool, metrics: PoolMetrics, trend: TrendAnalysis): number {
    let score = 0;
    
    // Small cap bonus (TVL < $2M)
    if (pool.tvl < 2000000) score += 0.3;
    
    // High volume bonus
    if (metrics.volumeToTvlRatio > 0.5) score += 0.3;
    
    // High fee APR bonus
    if (metrics.feeAPR > 0.5) score += 0.2;
    
    // Trending volume
    if (trend.volumeTrend === 'up') score += 0.2;
    
    return Math.min(1, score);
  }
  
  private calculateRangeScore(pool: Pool, metrics: PoolMetrics, trend: TrendAnalysis): number {
    let score = 0;
    
    // Sideways price (ideal for range trading)
    if (trend.priceTrend === 'sideways') score += 0.4;
    
    // Low volatility (stable range)
    if (pool.volatility < 0.2) score += 0.3;
    
    // Good fee generation
    if (metrics.feeAPR > 0.3) score += 0.2;
    
    // Stable or decreasing volatility
    if (trend.volatilityTrend === 'decreasing' || trend.volatilityTrend === 'stable') {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }
  
  private calculateMomentumScore(pool: Pool, metrics: PoolMetrics, trend: TrendAnalysis): number {
    let score = 0;
    
    // Strong trend
    if (trend.priceTrend !== 'sideways' && trend.trendStrength > 0.6) score += 0.4;
    
    // Medium volatility (not too high, not too low)
    if (pool.volatility >= 0.15 && pool.volatility <= 0.35) score += 0.3;
    
    // Increasing volume
    if (trend.volumeTrend === 'up') score += 0.2;
    
    // Good trend strength
    score += trend.trendStrength * 0.1;
    
    return Math.min(1, score);
  }
  
  // ==========================================
  // CONFIDENCE CALCULATION
  // ==========================================
  
  private calculateConfidence(
    pool: Pool,
    metrics: PoolMetrics,
    trend: TrendAnalysis,
    opportunityScore: number
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Opportunity score contribution (0-40%)
    confidence += (opportunityScore / 100) * 0.4;
    
    // Trend stability contribution (0-20%)
    if (trend.volumeTrend === 'stable') confidence += 0.1;
    if (trend.priceTrend === 'sideways') confidence += 0.05;
    if (trend.volatilityTrend === 'stable' || trend.volatilityTrend === 'decreasing') {
      confidence += 0.05;
    }
    
    // Metrics contribution (0-20%)
    confidence += metrics.priceStability * 0.1;
    confidence += metrics.liquidityDepth * 0.1;
    
    // Pool age contribution (0-10%)
    confidence += metrics.ageScore * 0.1;
    
    // Historical performance (if available)
    const historicalScore = this.getHistoricalPerformance(pool.address);
    confidence += historicalScore * 0.1;
    
    return Math.min(1, Math.max(0, confidence));
  }
  
  private getHistoricalPerformance(poolAddress: string): number {
    // Check past decisions for this pool
    const pastDecisions = this.decisionHistory.filter(
      d => d.poolAddress === poolAddress && d.result !== undefined
    );
    
    if (pastDecisions.length === 0) return 0.5;
    
    const successfulDecisions = pastDecisions.filter(d => d.result?.success && (d.result?.pnl || 0) > 0);
    return successfulDecisions.length / pastDecisions.length;
  }
  
  // ==========================================
  // APR PROJECTION
  // ==========================================
  
  private projectAPR(
    pool: Pool,
    metrics: PoolMetrics,
    trend: TrendAnalysis,
    strategy: StrategyType
  ): number {
    let projectedAPR = metrics.feeAPR;
    
    // Adjust based on strategy
    switch (strategy) {
      case 'alpha':
        // Alpha can have higher returns but more risk
        projectedAPR *= 1.3;
        break;
      case 'range':
        // Range is more conservative
        projectedAPR *= 0.9;
        break;
      case 'momentum':
        // Momentum follows trends
        projectedAPR *= trend.trendStrength > 0.6 ? 1.2 : 0.95;
        break;
    }
    
    // Adjust based on volatility expectation
    if (trend.volatilityTrend === 'increasing') {
      projectedAPR *= 0.8; // Less predictable
    } else if (trend.volatilityTrend === 'decreasing') {
      projectedAPR *= 1.1; // More predictable
    }
    
    // Subtract expected IL (rough estimate)
    const expectedIL = (pool.volatility ** 2) / 2;
    projectedAPR -= expectedIL;
    
    return Math.max(0, projectedAPR);
  }
  
  // ==========================================
  // RISK ASSESSMENT
  // ==========================================
  
  private assessRisk(pool: Pool, metrics: PoolMetrics, trend: TrendAnalysis): number {
    let risk = 50; // Base risk score (0-100, lower is better)
    
    // Volatility risk
    risk += pool.volatility * 30;
    
    // TVL risk (lower TVL = higher risk)
    if (pool.tvl < 500000) risk += 20;
    else if (pool.tvl < 1000000) risk += 10;
    
    // Trend risk
    if (trend.volatilityTrend === 'increasing') risk += 15;
    if (trend.priceTrend !== 'sideways' && trend.trendStrength > 0.7) risk += 10;
    
    // Age risk
    risk -= metrics.ageScore * 15;
    
    // Stability bonus
    risk -= metrics.priceStability * 10;
    
    return Math.max(0, Math.min(100, risk));
  }
  
  // ==========================================
  // OPTIMAL RANGE CALCULATION
  // ==========================================
  
  private calculateOptimalRange(
    pool: Pool,
    trend: TrendAnalysis,
    strategy: StrategyType
  ): { lower: number; upper: number } {
    const currentPrice = pool.currentPrice;
    let width: number;
    
    // Base width by strategy
    switch (strategy) {
      case 'alpha':
        width = 0.10; // ±10%
        break;
      case 'range':
        width = 0.20; // ±20%
        break;
      case 'momentum':
        width = 0.15; // ±15%
        break;
    }
    
    // Adjust for volatility
    width *= (1 + pool.volatility * 2);
    
    // Adjust for volatility trend
    if (trend.volatilityTrend === 'increasing') width *= 1.3;
    else if (trend.volatilityTrend === 'decreasing') width *= 0.8;
    
    // Cap width
    width = Math.min(0.50, width);
    
    return {
      lower: currentPrice * (1 - width),
      upper: currentPrice * (1 + width),
    };
  }
  
  // ==========================================
  // POSITION SIZING
  // ==========================================
  
  private calculatePositionSize(
    confidence: number,
    riskScore: number,
    pool: Pool
  ): number {
    const maxSize = config.trading.maxPerPool; // e.g., 0.20 = 20%
    
    // Adjust by confidence
    const confidenceMult = confidence;
    
    // Adjust by risk (lower risk = bigger size)
    const riskMult = 1 - (riskScore / 100);
    
    // Age adjustment
    const ageHours = (Date.now() - pool.createdAt.getTime()) / (1000 * 60 * 60);
    const ageMult = ageHours > 168 ? 1.0 : ageHours > 72 ? 0.8 : ageHours > 24 ? 0.5 : 0;
    
    return maxSize * confidenceMult * riskMult * ageMult;
  }
  
  // ==========================================
  // ACTION DETERMINATION
  // ==========================================
  
  private determineAction(
    pool: Pool,
    confidence: number,
    riskScore: number,
    opportunityScore: number
  ): ActionType {
    // Skip conditions
    if (confidence < config.trading.minAIConfidence) {
      return 'skip';
    }
    
    if (riskScore > 70) {
      return 'skip';
    }
    
    if (opportunityScore < 40) {
      return 'skip';
    }
    
    // Enter conditions
    if (confidence > 0.8 && riskScore < 50 && opportunityScore > 60) {
      return 'enter';
    }
    
    if (confidence > 0.75 && opportunityScore > 50) {
      return 'enter';
    }
    
    return 'skip';
  }
  
  // ==========================================
  // REASONING GENERATION
  // ==========================================
  
  private generateReasoning(
    pool: Pool,
    metrics: PoolMetrics,
    trend: TrendAnalysis,
    strategy: StrategyType,
    confidence: number
  ): string {
    const parts: string[] = [];
    
    // Pool identification
    parts.push(`${pool.tokenA.symbol}/${pool.tokenB.symbol} analysis:`);
    
    // Strategy reasoning
    switch (strategy) {
      case 'alpha':
        parts.push(`Selected Alpha strategy for small-cap opportunity with ${(metrics.feeAPR * 100).toFixed(1)}% fee APR.`);
        break;
      case 'range':
        parts.push(`Selected Range strategy for sideways market with ${(metrics.priceStability * 100).toFixed(0)}% price stability.`);
        break;
      case 'momentum':
        parts.push(`Selected Momentum strategy for ${trend.priceTrend} trend with ${(trend.trendStrength * 100).toFixed(0)}% strength.`);
        break;
    }
    
    // Key metrics
    parts.push(`Volume/TVL ratio: ${metrics.volumeToTvlRatio.toFixed(2)}.`);
    parts.push(`Volatility: ${(pool.volatility * 100).toFixed(1)}% (${trend.volatilityTrend}).`);
    
    // Confidence explanation
    if (confidence > 0.8) {
      parts.push(`High confidence (${(confidence * 100).toFixed(0)}%) due to strong metrics and stable trends.`);
    } else if (confidence > 0.6) {
      parts.push(`Medium confidence (${(confidence * 100).toFixed(0)}%) with acceptable risk/reward ratio.`);
    }
    
    return parts.join(' ');
  }
  
  // ==========================================
  // POSITION ANALYSIS (for rebalance/exit)
  // ==========================================
  
  async analyzePosition(position: Position): Promise<AIDecision> {
    const poolAnalysis = this.scoutAgent.getCachedAnalysis(position.poolAddress);
    
    if (!poolAnalysis) {
      throw new Error(`No cached analysis for pool ${position.poolAddress}`);
    }
    
    const decision = await this.analyzeOpportunity(poolAnalysis);
    
    // Override action based on position state
    if (position.pnl.percentage >= config.trading.takeProfitPercentage * 100) {
      decision.action = 'exit';
      decision.reasoning = `Profit target reached: ${position.pnl.percentage.toFixed(2)}%. ` + decision.reasoning;
    } else if (position.pnl.percentage <= -config.trading.stopLossPercentage * 100) {
      decision.action = 'exit';
      decision.reasoning = `Stop loss triggered: ${position.pnl.percentage.toFixed(2)}%. ` + decision.reasoning;
    } else if (!position.inRange) {
      decision.action = 'rebalance';
      decision.reasoning = `Position out of range. ` + decision.reasoning;
    }
    
    return decision;
  }
  
  // ==========================================
  // UTILITY METHODS
  // ==========================================
  
  private generateDecisionId(): string {
    return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getDecisionHistory(): AIDecision[] {
    return [...this.decisionHistory];
  }
  
  updateDecisionResult(decisionId: string, result: { success: boolean; pnl?: number }): void {
    const decision = this.decisionHistory.find(d => d.id === decisionId);
    if (decision) {
      decision.result = result;
    }
  }
}

export default AnalystAgent;
