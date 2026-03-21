// ==========================================
// JUPITER SERVICE
// Integration with Jupiter Aggregator for optimal swap routing
// ==========================================

import axios from 'axios';
import { Connection, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js';
import { WalletService } from './WalletService';
import { config } from '../config';
import { logger, tradeLogger } from '../utils/logger';
import { JupiterQuote, RoutePlanStep } from '../types';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number; // in lamports/smallest unit
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
}

interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  error?: string;
}

export class JupiterService {
  private connection: Connection;
  private walletService: WalletService;
  private baseUrl: string;
  private apiKey?: string;
  private tokenList: TokenInfo[] = [];

  constructor(walletService: WalletService) {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    this.walletService = walletService;
    this.baseUrl = config.jupiter.apiUrl;
    this.apiKey = config.jupiter.apiKey;
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('🔄 Initializing Jupiter service...');

    try {
      // Load token list
      await this.loadTokenList();

      logger.info(`✅ Jupiter service initialized`);
      logger.info(`   API URL: ${this.baseUrl}`);
      logger.info(`   Tokens loaded: ${this.tokenList.length}`);

    } catch (error) {
      logger.error('❌ Failed to initialize Jupiter service:', error);
      throw error;
    }
  }

  // ==========================================
  // TOKEN LIST
  // ==========================================

  private async loadTokenList(): Promise<void> {
    try {
      const response = await axios.get('https://token.jup.ag/all');
      this.tokenList = response.data;
    } catch (error) {
      logger.warn('Could not load token list from Jupiter, using fallback');
      // Fallback token list
      this.tokenList = [
        {
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Wrapped SOL',
          decimals: 9
        },
        {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6
        }
      ];
    }
  }

  getTokenList(): TokenInfo[] {
    return this.tokenList;
  }

  findTokenBySymbol(symbol: string): TokenInfo | null {
    const upperSymbol = symbol.toUpperCase();
    return this.tokenList.find(t => t.symbol.toUpperCase() === upperSymbol) || null;
  }

  findTokenByAddress(address: string): TokenInfo | null {
    return this.tokenList.find(t => t.address === address) || null;
  }

  // ==========================================
  // QUOTES
  // ==========================================

  async getQuote(params: QuoteParams): Promise<JupiterQuote> {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = config.jupiter.defaultSlippageBps,
      onlyDirectRoutes = false
    } = params;

    try {
      const url = new URL(`${this.baseUrl}/quote`);
      url.searchParams.append('inputMint', inputMint);
      url.searchParams.append('outputMint', outputMint);
      url.searchParams.append('amount', amount.toString());
      url.searchParams.append('slippageBps', slippageBps.toString());
      url.searchParams.append('onlyDirectRoutes', onlyDirectRoutes.toString());
      url.searchParams.append('asLegacyTransaction', 'false');

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(url.toString(), { headers });

      // Transform response to our type
      const quote: JupiterQuote = {
        inputMint: response.data.inputMint,
        outputMint: response.data.outputMint,
        inAmount: parseInt(response.data.inAmount),
        outAmount: parseInt(response.data.outAmount),
        otherAmountThreshold: parseInt(response.data.otherAmountThreshold),
        swapMode: response.data.swapMode,
        slippageBps: response.data.slippageBps,
        platformFee: response.data.platformFee,
        priceImpactPct: parseFloat(response.data.priceImpactPct),
        routePlan: response.data.routePlan.map((step: any) => ({
          swapInfo: {
            ammKey: step.swapInfo.ammKey,
            label: step.swapInfo.label,
            inputMint: step.swapInfo.inputMint,
            outputMint: step.swapInfo.outputMint,
            inAmount: parseInt(step.swapInfo.inAmount),
            outAmount: parseInt(step.swapInfo.outAmount),
            feeAmount: parseInt(step.swapInfo.feeAmount),
            feeMint: step.swapInfo.feeMint
          },
          percent: step.percent
        })),
        contextSlot: response.data.contextSlot,
        timeTaken: response.data.timeTaken
      };

      return quote;

    } catch (error) {
      logger.error('Error fetching Jupiter quote:', error);
      throw error;
    }
  }

  async getBestRoute(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<{ quote: JupiterQuote; routes: RoutePlanStep[] }> {
    const quote = await this.getQuote({
      inputMint,
      outputMint,
      amount
    });

    return {
      quote,
      routes: quote.routePlan
    };
  }

  calculatePriceImpact(quote: JupiterQuote): number {
    return quote.priceImpactPct;
  }

  // ==========================================
  // SWAP EXECUTION
  // ==========================================

  async executeSwap(quote: JupiterQuote, options: {
    wrapUnwrapSOL?: boolean;
    feeAccount?: string;
  } = {}): Promise<SwapResult> {
    const startTime = Date.now();

    try {
      logger.info('🔄 Executing Jupiter swap...');
      logger.info(`   Input: ${quote.inAmount} ${quote.inputMint}`);
      logger.info(`   Output: ${quote.outAmount} ${quote.outputMint}`);
      logger.info(`   Slippage: ${quote.slippageBps / 100}%`);
      logger.info(`   Price Impact: ${quote.priceImpactPct.toFixed(2)}%`);

      // 1. Get swap transaction
      const swapTransaction = await this.getSwapTransaction(quote, options);

      // 2. Deserialize transaction
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64')
      );

      // 3. Simulate first (if enabled)
      if (!config.features.dryRun) {
        const simulation = await this.walletService.simulateTransaction(transaction);
        if (!simulation.success) {
          throw new Error(`Simulation failed: ${simulation.error}`);
        }
      }

      // 4. Send transaction
      const signature = await this.walletService.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        commitment: 'confirmed'
      });

      const executionTime = Date.now() - startTime;

      // 5. Log trade
      tradeLogger.info('Swap executed', {
        signature,
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
        slippageBps: quote.slippageBps,
        executionTimeMs: executionTime,
        routes: quote.routePlan.length
      });

      logger.info(`✅ Swap completed: ${signature}`);
      logger.info(`   Execution time: ${executionTime}ms`);

      return {
        success: true,
        signature,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      };

    } catch (error) {
      logger.error('❌ Swap failed:', error);

      return {
        success: false,
        inputAmount: quote.inAmount,
        outputAmount: 0,
        priceImpact: 0,
        error: error.message
      };
    }
  }

  private async getSwapTransaction(
    quote: JupiterQuote,
    options: {
      wrapUnwrapSOL?: boolean;
      feeAccount?: string;
    }
  ): Promise<string> {
    try {
      const userPublicKey = this.walletService.getPublicKey().toBase58();

      const requestBody: any = {
        quoteResponse: {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: quote.inAmount.toString(),
          outAmount: quote.outAmount.toString(),
          otherAmountThreshold: quote.otherAmountThreshold.toString(),
          swapMode: quote.swapMode,
          slippageBps: quote.slippageBps,
          platformFee: quote.platformFee,
          priceImpactPct: quote.priceImpactPct.toString(),
          routePlan: quote.routePlan,
          contextSlot: quote.contextSlot,
          timeTaken: quote.timeTaken
        },
        userPublicKey,
        wrapAndUnwrapSol: options.wrapUnwrapSOL ?? true,
        asLegacyTransaction: false,
        useSharedAccounts: true,
        prioritizationFeeLamports: config.gas.priorityFee
      };

      if (options.feeAccount) {
        requestBody.feeAccount = options.feeAccount;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.post(
        `${this.baseUrl}/swap`,
        requestBody,
        { headers }
      );

      return response.data.swapTransaction;

    } catch (error) {
      logger.error('Error getting swap transaction:', error);
      throw error;
    }
  }

  // ==========================================
  // BATCH SWAPS (for rebalancing)
  // ==========================================

  async executeBatchSwaps(swaps: { quote: JupiterQuote; label: string }[]): Promise<{
    success: boolean;
    results: SwapResult[];
    totalExecutionTime: number;
  }> {
    const startTime = Date.now();
    const results: SwapResult[] = [];

    logger.info(`🔄 Executing ${swaps.length} swaps in batch...`);

    for (const swap of swaps) {
      try {
        const result = await this.executeSwap(swap.quote);
        results.push(result);

        if (!result.success) {
          logger.error(`❌ Swap failed: ${swap.label}`);
          // Continue with next swap or stop based on strategy
        }

        // Small delay between swaps
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        logger.error(`❌ Error in batch swap ${swap.label}:`, error);
        results.push({
          success: false,
          inputAmount: swap.quote.inAmount,
          outputAmount: 0,
          priceImpact: 0,
          error: error.message
        });
      }
    }

    const totalExecutionTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    logger.info(`✅ Batch swaps complete: ${successCount}/${swaps.length} successful`);
    logger.info(`   Total time: ${totalExecutionTime}ms`);

    return {
      success: successCount === swaps.length,
      results,
      totalExecutionTime
    };
  }

  // ==========================================
  // SLIPPAGE CALCULATION
  // ==========================================

  calculateOptimalSlippage(priceImpact: number, volatility: number): number {
    // Base slippage from config
    let slippageBps = config.jupiter.defaultSlippageBps;

    // Increase slippage based on price impact
    if (priceImpact > 1) {
      slippageBps += 50; // +0.5%
    }
    if (priceImpact > 2) {
      slippageBps += 100; // +1%
    }

    // Increase slippage based on volatility
    if (volatility > 0.3) {
      slippageBps += 50;
    }

    // Cap at max slippage
    return Math.min(slippageBps, config.jupiter.maxSlippageBps);
  }

  // ==========================================
  // VALIDATION
  // ==========================================

  validateSwapParams(params: QuoteParams): { valid: boolean; error?: string } {
    // Validate mint addresses
    try {
      new PublicKey(params.inputMint);
      new PublicKey(params.outputMint);
    } catch (error) {
      return { valid: false, error: 'Invalid mint address' };
    }

    // Validate amount
    if (params.amount <= 0) {
      return { valid: false, error: 'Amount must be positive' };
    }

    // Validate slippage
    const slippage = params.slippageBps || config.jupiter.defaultSlippageBps;
    if (slippage < 0 || slippage > 1000) {
      return { valid: false, error: 'Slippage must be between 0 and 10%' };
    }

    return { valid: true };
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async getSolPrice(): Promise<number> {
    try {
      // Simple SOL price check using USDC quote
      const quote = await this.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112', // SOL
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amount: 1_000_000_000 // 1 SOL
      });

      return quote.outAmount / 1_000_000; // USDC has 6 decimals
    } catch (error) {
      logger.warn('Could not fetch SOL price:', error);
      return 100; // Fallback price
    }
  }

  formatTokenAmount(amount: number, decimals: number): string {
    return (amount / Math.pow(10, decimals)).toFixed(decimals);
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Try to get a simple quote
      await this.getQuote({
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: 1_000_000
      });

      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency
      };

    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

export default JupiterService;
