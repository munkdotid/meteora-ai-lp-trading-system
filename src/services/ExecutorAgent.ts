// ==========================================
// EXECUTOR AGENT
// Executes trades via Jupiter and Meteora
// ==========================================

import { Connection, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { MeteoraService } from './MeteoraService';
import { JupiterService } from './JupiterService';
import { WalletService } from './WalletService';
import { DatabaseService } from './DatabaseService';
import { config } from '../config';
import { logger, tradeLogger } from '../utils/logger';
import {
  TradeIntent,
  TradeExecution,
  TradeAction,
  AIDecision,
  Position,
  JupiterQuote,
} from '../types';

export interface ExecutionResult {
  success: boolean;
  position?: Position;
  error?: string;
  executionTime: number;
  gasCost: number;
  slippage: number;
}

export class ExecutorAgent {
  private connection: Connection;
  private meteoraService: MeteoraService;
  private jupiterService: JupiterService;
  private walletService: WalletService;
  private db: DatabaseService;

  constructor(
    meteoraService: MeteoraService,
    jupiterService: JupiterService,
    walletService: WalletService,
    db: DatabaseService
  ) {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.meteoraService = meteoraService;
    this.jupiterService = jupiterService;
    this.walletService = walletService;
    this.db = db;
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('⚡ Initializing executor agent...');

    try {
      // Verify wallet is initialized
      if (!this.walletService.isInitialized()) {
        throw new Error('Wallet service not initialized');
      }

      logger.info('✅ Executor agent initialized');

    } catch (error) {
      logger.error('❌ Failed to initialize executor agent:', error);
      throw error;
    }
  }

  // ==========================================
  // ENTRY EXECUTION
  // ==========================================

  async executeEntry(decision: AIDecision, positionSizeUsd: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      logger.info('🚀 Executing entry trade...');
      logger.info(`   Pool: ${decision.poolAddress}`);
      logger.info(`   Strategy: ${decision.strategy}`);
      logger.info(`   Size: $${positionSizeUsd.toFixed(2)}`);

      // Get pool info
      const pool = await this.meteoraService.getPool(decision.poolAddress);
      
      // Determine tokens
      const tokenA = pool.tokenA;
      const tokenB = pool.tokenB;

      // Calculate amounts
      const halfValue = positionSizeUsd / 2;
      const solPrice = 100; // Placeholder - should fetch real price
      const solAmount = (halfValue / solPrice) * 1e9; // Convert to lamports

      // Step 1: Swap SOL to Token A (if needed)
      let tokenAAmount = solAmount;
      let swapASignature: string | undefined;

      if (tokenA.symbol !== 'SOL' && tokenA.symbol !== 'WSOL') {
        const swapAResult = await this.executeSwap(
          'So11111111111111111111111111111111111111112', // SOL
          tokenA.address,
          Math.floor(solAmount)
        );

        if (!swapAResult.success) {
          throw new Error(`Failed to swap for token A: ${swapAResult.error}`);
        }

        swapASignature = swapAResult.signature;
        tokenAAmount = swapAResult.outputAmount;
        
        logger.info(`✅ Swapped SOL to ${tokenA.symbol}: ${swapASignature}`);
      }

      // Step 2: Swap SOL to Token B (if needed)
      let tokenBAmount = solAmount;
      let swapBSignature: string | undefined;

      if (tokenB.symbol !== 'SOL' && tokenB.symbol !== 'WSOL') {
        const swapBResult = await this.executeSwap(
          'So11111111111111111111111111111111111111112', // SOL
          tokenB.address,
          Math.floor(solAmount)
        );

        if (!swapBResult.success) {
          throw new Error(`Failed to swap for token B: ${swapBResult.error}`);
        }

        swapBSignature = swapBResult.signature;
        tokenBAmount = swapBResult.outputAmount;
        
        logger.info(`✅ Swapped SOL to ${tokenB.symbol}: ${swapBSignature}`);
      }

      // Step 3: Add liquidity to Meteora
      const binRange = await this.meteoraService.calculateOptimalBinRange(
        decision.poolAddress,
        decision.strategy === 'alpha' ? 'narrow' : decision.strategy === 'range' ? 'medium' : 'wide',
        pool.volatility
      );

      const liquidityResult = await this.meteoraService.addLiquidity({
        poolAddress: decision.poolAddress,
        tokenXAmount: tokenAAmount / 1e9,
        tokenYAmount: tokenBAmount / 1e9,
        strategyParams: {
          strategyType: this.mapStrategyToDLMM(decision.strategy || 'range'),
          minBinId: binRange.minBinId,
          maxBinId: binRange.maxBinId,
        },
      });

      logger.info(`✅ Liquidity added: ${liquidityResult.signature}`);

      const executionTime = Date.now() - startTime;

      // Log trades
      if (swapASignature) {
        await this.logTrade({
          type: 'entry',
          action: 'swap',
          tokenIn: 'SOL',
          tokenOut: tokenA.symbol,
          amountIn: solAmount / 1e9,
          amountOut: tokenAAmount / Math.pow(10, tokenA.decimals),
          txSignature: swapASignature,
          success: true,
        });
      }

      if (swapBSignature) {
        await this.logTrade({
          type: 'entry',
          action: 'swap',
          tokenIn: 'SOL',
          tokenOut: tokenB.symbol,
          amountIn: solAmount / 1e9,
          amountOut: tokenBAmount / Math.pow(10, tokenB.decimals),
          txSignature: swapBSignature,
          success: true,
        });
      }

      await this.logTrade({
        type: 'entry',
        action: 'add_liquidity',
        tokenIn: tokenA.symbol,
        tokenOut: tokenB.symbol,
        amountIn: tokenAAmount / Math.pow(10, tokenA.decimals),
        amountOut: tokenBAmount / Math.pow(10, tokenB.decimals),
        txSignature: liquidityResult.signature,
        success: true,
      });

      tradeLogger.info('Entry executed', {
        poolAddress: decision.poolAddress,
        strategy: decision.strategy,
        investmentUsd: positionSizeUsd,
        liquidityTx: liquidityResult.signature,
        executionTimeMs: executionTime,
      });

      return {
        success: true,
        executionTime,
        gasCost: 0.001, // Placeholder
        slippage: 0.005, // Placeholder
      };

    } catch (error) {
      logger.error('❌ Entry execution failed:', error);
      
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        gasCost: 0,
        slippage: 0,
      };
    }
  }

  // ==========================================
  // EXIT EXECUTION
  // ==========================================

  async executeExit(position: Position): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      logger.info('🚪 Executing exit trade...');
      logger.info(`   Position: ${position.id}`);
      logger.info(`   Pool: ${position.poolAddress}`);

      // Step 1: Remove liquidity
      const removeResult = await this.meteoraService.removeLiquidity({
        poolAddress: position.poolAddress,
        positionAddress: position.id, // Would need actual Meteora position address
        shouldClaimFee: true,
      });

      logger.info(`✅ Liquidity removed: ${removeResult.signature}`);

      const pool = await this.meteoraService.getPool(position.poolAddress);
      const tokenA = pool.tokenA;
      const tokenB = pool.tokenB;

      // Step 2: Swap tokens back to SOL (if needed)
      let totalSolReceived = 0;

      if (tokenA.symbol !== 'SOL' && tokenA.symbol !== 'WSOL') {
        const swapAResult = await this.executeSwap(
          tokenA.address,
          'So11111111111111111111111111111111111111112', // SOL
          Math.floor(removeResult.tokenXReceived * Math.pow(10, tokenA.decimals))
        );

        if (swapAResult.success) {
          totalSolReceived += swapAResult.outputAmount / 1e9;
          logger.info(`✅ Swapped ${tokenA.symbol} to SOL: ${swapAResult.signature}`);
        }
      } else {
        totalSolReceived += removeResult.tokenXReceived;
      }

      if (tokenB.symbol !== 'SOL' && tokenB.symbol !== 'WSOL') {
        const swapBResult = await this.executeSwap(
          tokenB.address,
          'So11111111111111111111111111111111111111112', // SOL
          Math.floor(removeResult.tokenYReceived * Math.pow(10, tokenB.decimals))
        );

        if (swapBResult.success) {
          totalSolReceived += swapBResult.outputAmount / 1e9;
          logger.info(`✅ Swapped ${tokenB.symbol} to SOL: ${swapBResult.signature}`);
        }
      } else {
        totalSolReceived += removeResult.tokenYReceived;
      }

      const executionTime = Date.now() - startTime;

      // Log trade
      await this.logTrade({
        type: 'exit',
        action: 'remove_liquidity',
        tokenIn: tokenA.symbol,
        tokenOut: tokenB.symbol,
        amountIn: removeResult.tokenXReceived,
        amountOut: removeResult.tokenYReceived,
        txSignature: removeResult.signature,
        success: true,
      });

      tradeLogger.info('Exit executed', {
        positionId: position.id,
        poolAddress: position.poolAddress,
        solReceived: totalSolReceived,
        removeLiquidityTx: removeResult.signature,
        executionTimeMs: executionTime,
      });

      return {
        success: true,
        executionTime,
        gasCost: 0.001,
        slippage: 0.005,
      };

    } catch (error) {
      logger.error('❌ Exit execution failed:', error);

      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        gasCost: 0,
        slippage: 0,
      };
    }
  }

  // ==========================================
  // REBALANCE EXECUTION
  // ==========================================

  async executeRebalance(
    position: Position,
    newRange?: { lower: number; upper: number }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      logger.info('🔄 Executing rebalance...');
      logger.info(`   Position: ${position.id}`);

      // Step 1: Remove liquidity
      const removeResult = await this.meteoraService.removeLiquidity({
        poolAddress: position.poolAddress,
        positionAddress: position.id,
        shouldClaimFee: true,
      });

      logger.info(`✅ Liquidity removed: ${removeResult.signature}`);

      // Step 2: Calculate new range and bin range
      const pool = await this.meteoraService.getPool(position.poolAddress);
      const binRange = await this.meteoraService.calculateOptimalBinRange(
        position.poolAddress,
        position.strategy === 'alpha' ? 'narrow' : position.strategy === 'range' ? 'medium' : 'wide',
        pool.volatility
      );

      // Step 3: Add liquidity with new range
      const liquidityResult = await this.meteoraService.addLiquidity({
        poolAddress: position.poolAddress,
        tokenXAmount: removeResult.tokenXReceived,
        tokenYAmount: removeResult.tokenYReceived,
        strategyParams: {
          strategyType: this.mapStrategyToDLMM(position.strategy),
          minBinId: binRange.minBinId,
          maxBinId: binRange.maxBinId,
        },
      });

      logger.info(`✅ Liquidity re-added: ${liquidityResult.signature}`);

      const executionTime = Date.now() - startTime;

      // Log trade
      await this.logTrade({
        type: 'rebalance',
        action: 'add_liquidity',
        tokenIn: pool.tokenA.symbol,
        tokenOut: pool.tokenB.symbol,
        amountIn: removeResult.tokenXReceived,
        amountOut: removeResult.tokenYReceived,
        txSignature: liquidityResult.signature,
        success: true,
      });

      tradeLogger.info('Rebalance executed', {
        positionId: position.id,
        poolAddress: position.poolAddress,
        oldRange: `${position.range.lower}-${position.range.upper}`,
        newRange: newRange ? `${newRange.lower}-${newRange.upper}` : 'auto',
        rebalanceTx: liquidityResult.signature,
        executionTimeMs: executionTime,
      });

      return {
        success: true,
        executionTime,
        gasCost: 0.002,
        slippage: 0.01,
      };

    } catch (error) {
      logger.error('❌ Rebalance execution failed:', error);

      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        gasCost: 0,
        slippage: 0,
      };
    }
  }

  // ==========================================
  // SWAP EXECUTION
  // ==========================================

  private async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<{
    success: boolean;
    signature?: string;
    outputAmount?: number;
    error?: string;
  }> {
    try {
      // Get quote from Jupiter
      const quote = await this.jupiterService.getQuote({
        inputMint,
        outputMint,
        amount,
        slippageBps: config.jupiter.defaultSlippageBps,
      });

      // Execute swap
      const result = await this.jupiterService.executeSwap(quote);

      return {
        success: result.success,
        signature: result.signature,
        outputAmount: result.outputAmount,
        error: result.error,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ==========================================
  // TRADE LOGGING
  // ==========================================

  private async logTrade(action: {
    type: 'entry' | 'exit' | 'rebalance';
    action: 'swap' | 'add_liquidity' | 'remove_liquidity';
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: number;
    amountOut?: number;
    txSignature: string;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.db.createTrade({
        positionId: 'pending', // Would need actual position ID
        type: action.type,
        action: action.action,
        tokenIn: action.tokenIn,
        tokenOut: action.tokenOut,
        amountIn: action.amountIn,
        amountOut: action.amountOut,
        slippage: 0.005, // Placeholder
        gasCost: 0.001, // Placeholder
        txSignature: action.txSignature,
        success: action.success,
        error: action.error,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error logging trade:', error);
    }
  }

  // ==========================================
  // BATCH EXECUTION
  // ==========================================

  async executeBatchEntries(decisions: AIDecision[]): Promise<{
    successful: number;
    failed: number;
    results: ExecutionResult[];
  }> {
    const results: ExecutionResult[] = [];
    let successful = 0;
    let failed = 0;

    logger.info(`🚀 Executing ${decisions.length} entries in batch...`);

    for (const decision of decisions) {
      try {
        // Calculate position size
        const walletBalance = await this.walletService.getBalance();
        const solPrice = 100; // Placeholder
        const positionSizeUsd = (walletBalance * solPrice) * (decision.positionSize || 0.2);

        const result = await this.executeEntry(decision, positionSizeUsd);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Small delay between entries
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        logger.error(`Failed to execute entry for ${decision.poolAddress}:`, error);
        failed++;
        results.push({
          success: false,
          error: error.message,
          executionTime: 0,
          gasCost: 0,
          slippage: 0,
        });
      }
    }

    logger.info(`✅ Batch entries complete: ${successful}/${decisions.length} successful`);

    return {
      successful,
      failed,
      results,
    };
  }

  // ==========================================
  // SIMULATION
  // ==========================================

  async simulateEntry(decision: AIDecision): Promise<{
    success: boolean;
    estimatedOutput: number;
    priceImpact: number;
    error?: string;
  }> {
    try {
      // Get quote from Jupiter for simulation
      const pool = await this.meteoraService.getPool(decision.poolAddress);
      
      const walletBalance = await this.walletService.getBalance();
      const solPrice = 100;
      const positionSizeUsd = (walletBalance * solPrice) * (decision.positionSize || 0.2);
      const solAmount = (positionSizeUsd / 2 / solPrice) * 1e9;

      // Simulate swap
      const quote = await this.jupiterService.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: pool.tokenA.address,
        amount: Math.floor(solAmount),
      });

      return {
        success: true,
        estimatedOutput: quote.outAmount,
        priceImpact: quote.priceImpactPct,
      };

    } catch (error) {
      return {
        success: false,
        estimatedOutput: 0,
        priceImpact: 0,
        error: error.message,
      };
    }
  }

  // ==========================================
  // MEV PROTECTION
  // ==========================================

  async sendWithMevProtection(transaction: Transaction | VersionedTransaction): Promise<string> {
    if (!config.gas.useJitoBundles) {
      // Regular send
      return this.walletService.sendTransaction(transaction, {
        maxRetries: 3,
      });
    }

    // TODO: Implement Jito bundle submission
    // This would require Jito SDK integration
    logger.info('MEV protection via Jito bundles not yet implemented');
    
    return this.walletService.sendTransaction(transaction, {
      maxRetries: 3,
    });
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  private mapStrategyToDLMM(strategy: StrategyType | undefined): 'spot' | 'bidAsk' | 'curve' {
    const map: Record<StrategyType, 'spot' | 'bidAsk' | 'curve'> = {
      'alpha': 'spot',
      'range': 'spot',
      'momentum': 'bidAsk',
    };
    return map[strategy || 'range'] || 'spot';
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Check wallet balance (lightweight operation)
      await this.walletService.getBalance();

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
    logger.info('⚡ Executor agent disconnected');
  }
}

export default ExecutorAgent;
