// ==========================================
// METEORA SERVICE
// Integration with Meteora DLMM protocol
// ==========================================

import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { WalletService } from './WalletService';
import { config } from '../config';
import { logger, tradeLogger } from '../utils/logger';
import {
  Pool,
  DLMMPosition,
  Bin,
  DLMMStrategyParams,
  Token,
} from '../types';

export interface PositionInfo {
  address: string;
  poolAddress: string;
  lowerBinId: number;
  upperBinId: number;
  liquidityShares: number;
  tokenXAmount: number;
  tokenYAmount: number;
  totalXFees: number;
  totalYFees: number;
}

export interface Fees {
  tokenX: number;
  tokenY: number;
  usdValue: number;
}

export class MeteoraService {
  private connection: Connection;
  private walletService: WalletService;
  private pools: Map<string, DLMM> = new Map();

  constructor(walletService: WalletService) {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.walletService = walletService;
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('🏊 Initializing Meteora DLMM service...');

    try {
      // Test connection by getting version
      await this.connection.getVersion();

      logger.info('✅ Meteora service initialized');

    } catch (error) {
      logger.error('❌ Failed to initialize Meteora service:', error);
      throw error;
    }
  }

  // ==========================================
  // POOL DATA FETCHING
  // ==========================================

  async getPool(poolAddress: string): Promise<Pool> {
    try {
      const dlmmPool = await this.getOrCreateDLMM(poolAddress);

      // Get pool state
      const poolState = await dlmmPool.getPoolState();
      const activeBin = await dlmmPool.getActiveBin();

      // Calculate TVL
      const tvl = this.calculateTVL(poolState);

      // Calculate volume (from active bin or historical)
      const volume24h = await this.getPoolVolume(poolAddress, 24);

      // Calculate volatility
      const volatility = await this.calculateVolatility(poolAddress);

      // Get tokens
      const tokenX = await this.getTokenInfo(poolState.tokenXMint.toBase58());
      const tokenY = await this.getTokenInfo(poolState.tokenYMint.toBase58());

      const pool: Pool = {
        address: poolAddress,
        tokenA: tokenX,
        tokenB: tokenY,
        currentPrice: activeBin.price,
        tvl,
        volume24h,
        feeRate: poolState.baseFeeRatePercentage / 100, // Convert to decimal
        volatility,
        liquidityDistribution: {
          bins: [], // Will be populated on demand
          activeBinId: activeBin.binId,
        },
        createdAt: new Date(poolState.poolCreation.toNumber() * 1000),
        updatedAt: new Date(),
      };

      return pool;

    } catch (error) {
      logger.error(`Error fetching pool ${poolAddress}:`, error);
      throw error;
    }
  }

  async getAllPools(): Promise<Pool[]> {
    try {
      // This would typically fetch from Meteora API
      // For now, return an empty array or implement API call
      logger.warn('getAllPools not fully implemented - using placeholder');
      return [];

    } catch (error) {
      logger.error('Error fetching all pools:', error);
      return [];
    }
  }

  async getPoolHistory(poolAddress: string, days: number): Promise<Array<{
    timestamp: Date;
    price: number;
    volume: number;
    tvl: number;
    volatility: number;
  }>> {
    try {
      // This would fetch historical data from Meteora API
      // Placeholder implementation
      return [];

    } catch (error) {
      logger.error(`Error fetching pool history ${poolAddress}:`, error);
      return [];
    }
  }

  // ==========================================
  // DLMM POOL INSTANCE MANAGEMENT
  // ==========================================

  private async getOrCreateDLMM(poolAddress: string): Promise<DLMM> {
    if (this.pools.has(poolAddress)) {
      return this.pools.get(poolAddress)!;
    }

    try {
      const dlmmPool = await DLMM.create(
        this.connection,
        new PublicKey(poolAddress)
      );

      this.pools.set(poolAddress, dlmmPool);
      return dlmmPool;

    } catch (error) {
      logger.error(`Error creating DLMM instance for ${poolAddress}:`, error);
      throw error;
    }
  }

  // ==========================================
  // BIN DATA
  // ==========================================

  async getBins(poolAddress: string): Promise<Bin[]> {
    try {
      const dlmmPool = await this.getOrCreateDLMM(poolAddress);
      const bins = await dlmmPool.getAllBins();

      return bins.map(bin => ({
        id: bin.binId,
        price: bin.price,
        liquidityX: bin.xAmount.toNumber() / 1e9, // Adjust for decimals
        liquidityY: bin.yAmount.toNumber() / 1e9,
      }));

    } catch (error) {
      logger.error(`Error fetching bins for ${poolAddress}:`, error);
      return [];
    }
  }

  async getActiveBin(poolAddress: string): Promise<Bin> {
    try {
      const dlmmPool = await this.getOrCreateDLMM(poolAddress);
      const activeBin = await dlmmPool.getActiveBin();

      return {
        id: activeBin.binId,
        price: activeBin.price,
        liquidityX: 0, // Not provided by getActiveBin
        liquidityY: 0,
      };

    } catch (error) {
      logger.error(`Error fetching active bin for ${poolAddress}:`, error);
      throw error;
    }
  }

  async getBinsAroundActive(
    poolAddress: string,
    lowerOffset: number,
    upperOffset: number
  ): Promise<{ bins: Bin[]; minBinId: number; maxBinId: number }> {
    try {
      const dlmmPool = await this.getOrCreateDLMM(poolAddress);
      const activeBin = await dlmmPool.getActiveBin();

      const minBinId = activeBin.binId - lowerOffset;
      const maxBinId = activeBin.binId + upperOffset;

      // Get bins in range
      const allBins = await this.getBins(poolAddress);
      const binsInRange = allBins.filter(bin => bin.id >= minBinId && bin.id <= maxBinId);

      return {
        bins: binsInRange,
        minBinId,
        maxBinId,
      };

    } catch (error) {
      logger.error(`Error fetching bins around active for ${poolAddress}:`, error);
      throw error;
    }
  }

  // ==========================================
  // LIQUIDITY OPERATIONS
  // ==========================================

  async addLiquidity(params: {
    poolAddress: string;
    tokenXAmount: number;
    tokenYAmount: number;
    strategyParams: DLMMStrategyParams;
  }): Promise<{ signature: string; positionAddress: string }> {
    const startTime = Date.now();

    try {
      logger.info('🏊 Adding liquidity to Meteora DLMM...');
      logger.info(`   Pool: ${params.poolAddress}`);
      logger.info(`   Token X: ${params.tokenXAmount}`);
      logger.info(`   Token Y: ${params.tokenYAmount}`);
      logger.info(`   Strategy: ${params.strategyParams.strategyType}`);
      logger.info(`   Range: ${params.strategyParams.minBinId} - ${params.strategyParams.maxBinId}`);

      const dlmmPool = await this.getOrCreateDLMM(params.poolAddress);

      // Prepare transaction
      const initializePositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy(
        {
          owner: this.walletService.getPublicKey(),
          totalXAmount: params.tokenXAmount * 1e9, // Convert to lamports
          totalYAmount: params.tokenYAmount * 1e9,
          strategy: {
            maxBinId: params.strategyParams.maxBinId,
            minBinId: params.strategyParams.minBinId,
            strategyType: this.mapStrategyType(params.strategyParams.strategyType),
          },
        }
      );

      // Send transaction
      const signature = await this.walletService.sendTransaction(
        initializePositionTx,
        {
          maxRetries: 3,
          skipPreflight: false,
        }
      );

      const executionTime = Date.now() - startTime;

      // Get position address (this would need to be calculated or fetched)
      const positionAddress = 'pending'; // TODO: Calculate position PDA

      // Log trade
      tradeLogger.info('Liquidity added', {
        signature,
        poolAddress: params.poolAddress,
        tokenXAmount: params.tokenXAmount,
        tokenYAmount: params.tokenYAmount,
        strategyType: params.strategyParams.strategyType,
        binRange: `${params.strategyParams.minBinId}-${params.strategyParams.maxBinId}`,
        executionTimeMs: executionTime,
      });

      logger.info(`✅ Liquidity added: ${signature}`);
      logger.info(`   Position: ${positionAddress}`);
      logger.info(`   Execution time: ${executionTime}ms`);

      return {
        signature,
        positionAddress,
      };

    } catch (error) {
      logger.error('❌ Failed to add liquidity:', error);
      throw error;
    }
  }

  async removeLiquidity(params: {
    poolAddress: string;
    positionAddress: string;
    shouldClaimFee?: boolean;
  }): Promise<{ signature: string; tokenXReceived: number; tokenYReceived: number }> {
    try {
      logger.info('🏊 Removing liquidity from Meteora DLMM...');
      logger.info(`   Pool: ${params.poolAddress}`);
      logger.info(`   Position: ${params.positionAddress}`);

      const dlmmPool = await this.getOrCreateDLMM(params.poolAddress);

      // Get position info before removal
      const positionInfo = await this.getPositionInfo(params.positionAddress);

      // Remove liquidity
      const removeLiquidityTx = await dlmmPool.removeLiquidity(
        this.walletService.getPublicKey(),
        new PublicKey(params.positionAddress),
        params.shouldClaimFee ?? true
      );

      // Send transaction
      const signature = await this.walletService.sendTransaction(
        removeLiquidityTx,
        {
          maxRetries: 3,
        }
      );

      logger.info(`✅ Liquidity removed: ${signature}`);

      return {
        signature,
        tokenXReceived: positionInfo.tokenXAmount,
        tokenYReceived: positionInfo.tokenYAmount,
      };

    } catch (error) {
      logger.error('❌ Failed to remove liquidity:', error);
      throw error;
    }
  }

  async rebalancePosition(params: {
    poolAddress: string;
    positionAddress: string;
    newStrategyParams: DLMMStrategyParams;
  }): Promise<{ signature: string; newPositionAddress: string }> {
    try {
      logger.info('🔄 Rebalancing Meteora position...');

      // 1. Remove existing liquidity
      const removeResult = await this.removeLiquidity({
        poolAddress: params.poolAddress,
        positionAddress: params.positionAddress,
        shouldClaimFee: true,
      });

      // 2. Add liquidity with new range
      const addResult = await this.addLiquidity({
        poolAddress: params.poolAddress,
        tokenXAmount: removeResult.tokenXReceived,
        tokenYAmount: removeResult.tokenYReceived,
        strategyParams: params.newStrategyParams,
      });

      return {
        signature: addResult.signature,
        newPositionAddress: addResult.positionAddress,
      };

    } catch (error) {
      logger.error('❌ Failed to rebalance position:', error);
      throw error;
    }
  }

  // ==========================================
  // POSITION MANAGEMENT
  // ==========================================

  async getPositionInfo(positionAddress: string): Promise<PositionInfo> {
    try {
      // Fetch position data from chain
      // This would use DLMM SDK to get position details
      const positionData = await this.connection.getAccountInfo(
        new PublicKey(positionAddress)
      );

      if (!positionData) {
        throw new Error(`Position not found: ${positionAddress}`);
      }

      // Parse position data (simplified - actual implementation would parse buffer)
      return {
        address: positionAddress,
        poolAddress: '', // Extract from position data
        lowerBinId: 0,
        upperBinId: 0,
        liquidityShares: 0,
        tokenXAmount: 0,
        tokenYAmount: 0,
        totalXFees: 0,
        totalYFees: 0,
      };

    } catch (error) {
      logger.error(`Error fetching position info ${positionAddress}:`, error);
      throw error;
    }
  }

  async getPositionsByPool(poolAddress: string): Promise<PositionInfo[]> {
    try {
      // This would fetch all positions for a pool
      // Implementation depends on Meteora SDK capabilities
      return [];

    } catch (error) {
      logger.error(`Error fetching positions for pool ${poolAddress}:`, error);
      return [];
    }
  }

  // ==========================================
  // FEE CALCULATIONS
  // ==========================================

  async calculateFees(positionAddress: string): Promise<Fees> {
    try {
      const positionInfo = await this.getPositionInfo(positionAddress);

      // Calculate earned fees
      // This would use DLMM SDK to get fee accrual

      return {
        tokenX: positionInfo.totalXFees,
        tokenY: positionInfo.totalYFees,
        usdValue: 0, // Calculate using token prices
      };

    } catch (error) {
      logger.error(`Error calculating fees for ${positionAddress}:`, error);
      return {
        tokenX: 0,
        tokenY: 0,
        usdValue: 0,
      };
    }
  }

  async claimFees(positionAddress: string): Promise<{ signature: string; fees: Fees }> {
    try {
      logger.info('💰 Claiming fees...');

      const fees = await this.calculateFees(positionAddress);

      // Claim fees transaction (if applicable)
      // Some DLMM versions auto-claim on liquidity removal

      return {
        signature: '',
        fees,
      };

    } catch (error) {
      logger.error(`Error claiming fees for ${positionAddress}:`, error);
      throw error;
    }
  }

  // ==========================================
  // PRICE AND METRICS
  // ==========================================

  async getPoolPrice(poolAddress: string): Promise<number> {
    try {
      const activeBin = await this.getActiveBin(poolAddress);
      return activeBin.price;

    } catch (error) {
      logger.error(`Error fetching pool price ${poolAddress}:`, error);
      throw error;
    }
  }

  async getPoolVolume(poolAddress: string, hours: number): Promise<number> {
    try {
      // This would fetch historical volume data
      // Placeholder implementation
      return 0;

    } catch (error) {
      logger.error(`Error fetching pool volume ${poolAddress}:`, error);
      return 0;
    }
  }

  // ==========================================
  // CALCULATIONS
  // ==========================================

  private calculateTVL(poolState: any): number {
    // Calculate TVL from pool state
    // Simplified calculation - would use actual token prices
    const xAmount = poolState.reserveX.toNumber() / 1e9;
    const yAmount = poolState.reserveY.toNumber() / 1e9;

    // Convert to USD (would use price oracle in production)
    const xPrice = 1; // Placeholder
    const yPrice = 1; // Placeholder

    return (xAmount * xPrice) + (yAmount * yPrice);
  }

  private async calculateVolatility(poolAddress: string): Promise<number> {
    try {
      // Calculate volatility from historical prices
      const history = await this.getPoolHistory(poolAddress, 7);

      if (history.length < 2) {
        return 0.1; // Default 10% volatility
      }

      // Calculate standard deviation of log returns
      const prices = history.map(h => h.price);
      const logReturns = [];

      for (let i = 1; i < prices.length; i++) {
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
      }

      const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
      const variance = logReturns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / logReturns.length;
      const stdDev = Math.sqrt(variance);

      // Annualized volatility
      const annualizedVol = stdDev * Math.sqrt(365 * 24);

      return annualizedVol;

    } catch (error) {
      logger.error(`Error calculating volatility for ${poolAddress}:`, error);
      return 0.1; // Default 10%
    }
  }

  private mapStrategyType(strategyType: string): any {
    const strategyMap: Record<string, any> = {
      'spot': { spot: {} },
      'bidAsk': { bidAsk: {} },
      'curve': { curve: {} },
    };

    return strategyMap[strategyType] || { spot: {} };
  }

  // ==========================================
  // TOKEN UTILITIES
  // ==========================================

  private async getTokenInfo(mintAddress: string): Promise<Token> {
    // This would fetch token metadata from chain or API
    // Simplified implementation
    return {
      address: mintAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9,
    };
  }

  // ==========================================
  // RANGE CALCULATIONS
  // ==========================================

  async calculateOptimalBinRange(
    poolAddress: string,
    strategy: 'narrow' | 'medium' | 'wide',
    volatility?: number
  ): Promise<{ minBinId: number; maxBinId: number }> {
    try {
      const activeBin = await this.getActiveBin(poolAddress);
      const currentBinId = activeBin.binId;

      // Base range by strategy
      const rangeMap = {
        'narrow': 5,    // ±5 bins
        'medium': 15,   // ±15 bins
        'wide': 30,     // ±30 bins
      };

      let binRange = rangeMap[strategy];

      // Adjust for volatility
      if (volatility) {
        if (volatility > 0.5) {
          binRange = Math.floor(binRange * 1.5); // Expand range
        } else if (volatility < 0.1) {
          binRange = Math.floor(binRange * 0.8); // Tighten range
        }
      }

      return {
        minBinId: currentBinId - binRange,
        maxBinId: currentBinId + binRange,
      };

    } catch (error) {
      logger.error(`Error calculating bin range for ${poolAddress}:`, error);
      throw error;
    }
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Test by getting active bin for a known pool
      // Using a placeholder check
      await this.connection.getVersion();

      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
      };

    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async disconnect(): Promise<void> {
    // Clear pool cache
    this.pools.clear();
    logger.info('🏊 Meteora service disconnected');
  }
}

export default MeteoraService;
