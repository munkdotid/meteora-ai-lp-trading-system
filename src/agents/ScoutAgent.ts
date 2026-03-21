// ==========================================
// SCOUT AGENT
// Scans and ranks Meteora DLMM pools
// ==========================================

import { config } from '../config';
import { logger } from '../utils/logger';
import {
  Pool,
  PoolAnalysis,
  PoolMetrics,
  TrendAnalysis,
} from '../types';
import { MeteoraService } from '../services/MeteoraService';

export class ScoutAgent {
  private meteoraService: MeteoraService;
  private lastScanTime: Date | null = null;
  private cachedAnalyses: Map<string, PoolAnalysis> = new Map();
  
  constructor(meteoraService: MeteoraService) {
    this.meteoraService = meteoraService;
  }
  
  // ==========================================
  // MAIN SCAN FUNCTION
  // ==========================================
  
  async scanAllPools(): Promise<PoolAnalysis[]> {
    logger.info('🔍 Scout Agent: Starting pool scan...');
    
    try {
      // Fetch all pools from Meteora
      const pools = await this.meteoraService.getAllPools();
      logger.info(`📊 Found ${pools.length} total pools`);
      
      // Filter pools by basic criteria
      const filteredPools = this.filterPools(pools);
      logger.info(`🎯 ${filteredPools.length} pools passed initial filters`);
      
      // Analyze each pool
      const analyses: PoolAnalysis[] = [];
      
      for (const pool of filteredPools) {
        try {
          const analysis = await this.analyzePool(pool);
          analyses.push(analysis);
          this.cachedAnalyses.set(pool.address, analysis);
        } catch (error) {
          logger.error(`Error analyzing pool ${pool.address}:`, error);
        }
      }
      
      // Sort by opportunity score (descending)
      const sortedAnalyses = analyses
        .filter(a => a.recommendation !== 'avoid')
        .sort((a, b) => b.opportunityScore - a.opportunityScore);
      
      // Log top opportunities
      logger.info(`🌟 Top 5 opportunities:`);
      sortedAnalyses.slice(0, 5).forEach((analysis, i) => {
        const pool = analysis.pool;
        logger.info(
          `  ${i + 1}. ${pool.tokenA.symbol}/${pool.tokenB.symbol} - ` +
          `Score: ${analysis.opportunityScore.toFixed(2)} - ` +
          `TVL: $${(pool.tvl / 1000).toFixed(0)}K - ` +
          `Fee APR: ${(analysis.metrics.feeAPR * 100).toFixed(1)}%`
        );
      });
      
      this.lastScanTime = new Date();
      
      return sortedAnalyses;
      
    } catch (error) {
      logger.error('❌ Scout Agent: Pool scan failed', error);
      throw error;
    }
  }
  
  // ==========================================
  // POOL FILTERING
  // ==========================================
  
  private filterPools(pools: Pool[]): Pool[] {
    return pools.filter(pool => {
      // Minimum TVL check
      if (pool.tvl < config.trading.minPoolTVL) {
        return false;
      }
      
      // Minimum volume check
      if (pool.volume24h < config.trading.minVolume24h) {
        return false;
      }
      
      // Pool age check
      const ageHours = (Date.now() - pool.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < config.trading.minPoolAgeHours) {
        return false;
      }
      
      // Volatility check
      if (pool.volatility > config.trading.maxVolatility) {
        return false;
      }
      
      // Must be DLMM pool (has bins)
      if (!pool.liquidityDistribution || pool.liquidityDistribution.bins.length === 0) {
        return false;
      }
      
      return true;
    });
  }
  
  // ==========================================
  // POOL ANALYSIS
  // ==========================================
  
  private async analyzePool(pool: Pool): Promise<PoolAnalysis> {
    // Calculate metrics
    const metrics = this.calculateMetrics(pool);
    
    // Analyze trend
    const trend = await this.analyzeTrend(pool);
    
    // Calculate opportunity score
    const opportunityScore = this.calculateOpportunityScore(pool, metrics, trend);
    
    // Determine recommendation
    const recommendation = this.getRecommendation(opportunityScore, metrics, trend);
    
    return {
      pool,
      opportunityScore,
      metrics,
      trend,
      recommendation,
    };
  }
  
  private calculateMetrics(pool: Pool): PoolMetrics {
    // Volume/TVL ratio (higher = better for fees)
    const volumeToTvlRatio = pool.volume24h / pool.tvl;
    
    // Fee APR calculation
    const feeAPR = (pool.volume24h * pool.feeRate * 365) / pool.tvl;
    
    // Price stability (lower volatility = more stable)
    const priceStability = Math.max(0, 1 - pool.volatility);
    
    // Liquidity depth (based on number of bins and TVL)
    const binCount = pool.liquidityDistribution?.bins.length || 0;
    const liquidityDepth = Math.min(1, (pool.tvl / 1000000) * (binCount / 100));
    
    // Age score (older = more established, max score at 7 days)
    const ageHours = (Date.now() - pool.createdAt.getTime()) / (1000 * 60 * 60);
    const ageScore = Math.min(1, ageHours / (7 * 24));
    
    return {
      volumeToTvlRatio,
      feeAPR,
      priceStability,
      liquidityDepth,
      ageScore,
    };
  }
  
  private async analyzeTrend(pool: Pool): Promise<TrendAnalysis> {
    // Fetch historical data
    const history = await this.meteoraService.getPoolHistory(pool.address, 7);
    
    if (history.length < 3) {
      return {
        volumeTrend: 'stable',
        priceTrend: 'sideways',
        volatilityTrend: 'stable',
        trendStrength: 0.5,
      };
    }
    
    // Volume trend
    const recentVolume = history.slice(-3).reduce((sum, h) => sum + h.volume, 0) / 3;
    const olderVolume = history.slice(0, 3).reduce((sum, h) => sum + h.volume, 0) / 3;
    const volumeChange = (recentVolume - olderVolume) / olderVolume;
    
    const volumeTrend = volumeChange > 0.1 ? 'up' : 
                        volumeChange < -0.1 ? 'down' : 'stable';
    
    // Price trend
    const recentPrice = history[history.length - 1].price;
    const olderPrice = history[0].price;
    const priceChange = (recentPrice - olderPrice) / olderPrice;
    
    const priceTrend = priceChange > 0.05 ? 'up' : 
                       priceChange < -0.05 ? 'down' : 'sideways';
    
    // Volatility trend
    const recentVol = history.slice(-3).reduce((sum, h) => sum + h.volatility, 0) / 3;
    const olderVol = history.slice(0, 3).reduce((sum, h) => sum + h.volatility, 0) / 3;
    const volChange = (recentVol - olderVol) / olderVol;
    
    const volatilityTrend = volChange > 0.2 ? 'increasing' : 
                            volChange < -0.2 ? 'decreasing' : 'stable';
    
    // Trend strength (0-1)
    const trendStrength = Math.min(1, Math.abs(volumeChange) + Math.abs(priceChange));
    
    return {
      volumeTrend,
      priceTrend,
      volatilityTrend,
      trendStrength,
    };
  }
  
  // ==========================================
  // SCORING ALGORITHM
  // ==========================================
  
  private calculateOpportunityScore(
    pool: Pool,
    metrics: PoolMetrics,
    trend: TrendAnalysis
  ): number {
    // Base score from metrics
    let score = 0;
    
    // Fee APR weight (40%)
    const feeScore = Math.min(1, metrics.feeAPR / 1.0) * 40;
    score += feeScore;
    
    // Volume/TVL ratio (20%)
    const volumeScore = Math.min(1, metrics.volumeToTvlRatio * 10) * 20;
    score += volumeScore;
    
    // Price stability (15%)
    score += metrics.priceStability * 15;
    
    // Liquidity depth (10%)
    score += metrics.liquidityDepth * 10;
    
    // Age score (5%)
    score += metrics.ageScore * 5;
    
    // Trend bonus/penalty (10%)
    if (trend.volumeTrend === 'up') score += 5;
    if (trend.volumeTrend === 'down') score -= 3;
    if (trend.priceTrend === 'sideways') score += 5; // Good for LP
    if (trend.volatilityTrend === 'decreasing') score += 5;
    if (trend.volatilityTrend === 'increasing') score -= 5;
    
    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }
  
  private getRecommendation(
    score: number,
    metrics: PoolMetrics,
    trend: TrendAnalysis
  ): 'high' | 'medium' | 'low' | 'avoid' {
    // Auto-avoid conditions
    if (metrics.feeAPR < 0.10) return 'avoid'; // Less than 10% APR
    if (trend.volatilityTrend === 'increasing' && pool.volatility > 0.3) return 'avoid';
    
    // Score-based recommendation
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'avoid';
  }
  
  // ==========================================
  // PUBLIC METHODS
  // ==========================================
  
  getCachedAnalysis(poolAddress: string): PoolAnalysis | undefined {
    return this.cachedAnalyses.get(poolAddress);
  }
  
  getLastScanTime(): Date | null {
    return this.lastScanTime;
  }
  
  clearCache(): void {
    this.cachedAnalyses.clear();
    logger.info('🧹 Scout Agent: Cache cleared');
  }
}

export default ScoutAgent;
