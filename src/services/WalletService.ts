// ==========================================
// WALLET SERVICE
// Solana wallet management and transaction signing
// ==========================================

import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { config } from '../config';
import { logger } from '../utils/logger';
import { truncateAddress, createSafeErrorMessage } from '../utils/security';
import * as fs from 'fs';
import * as path from 'path';

export interface TokenAccount {
  mint: string;
  address: string;
  balance: number;
  decimals: number;
}

export interface WalletBalance {
  sol: number;
  usd: number;
  tokens: TokenAccount[];
}

export class WalletService {
  private connection: Connection;
  private keypair: Keypair | null = null;
  private publicKey: PublicKey | null = null;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('🔑 Initializing wallet service...');

    try {
      // Load wallet from private key or file
      if (config.solana.privateKey) {
        // Load from environment variable
        const secretKey = Buffer.from(config.solana.privateKey, 'base58');
        this.keypair = Keypair.fromSecretKey(secretKey);
      } else if (config.solana.keyPath) {
        // Load from file
        const keyPath = path.resolve(config.solana.keyPath);
        if (!fs.existsSync(keyPath)) {
          throw new Error(`Wallet key file not found: ${keyPath}`);
        }

        const keyData = fs.readFileSync(keyPath, 'utf-8');
        const secretKey = Buffer.from(JSON.parse(keyData));
        this.keypair = Keypair.fromSecretKey(secretKey);
      } else {
        throw new Error('No wallet key provided. Set SOLANA_WALLET_PRIVATE_KEY or WALLET_KEY_PATH');
      }

      this.publicKey = this.keypair.publicKey;

      // Verify connection
      await this.connection.getVersion();

      // Log truncated address for privacy (only first 4 and last 4 chars)
      const truncatedAddress = truncateAddress(this.publicKey.toBase58(), 4);
      logger.info(`✅ Wallet initialized: ${truncatedAddress}`);
      logger.debug(`Full wallet address: ${this.publicKey.toBase58()}`); // Only in debug mode
      logger.info(`   Network: ${config.solana.rpcUrl}`);

    } catch (error) {
      // Log safe error message
      const safeError = createSafeErrorMessage(error);
      logger.error('❌ Failed to initialize wallet:', safeError);
      logger.debug('Full error details:', error); // Only in debug
      throw new Error(safeError);
    }
  }

  // ==========================================
  // WALLET INFO
  // ==========================================

  getPublicKey(): PublicKey {
    if (!this.publicKey) {
      throw new Error('Wallet not initialized');
    }
    return this.publicKey;
  }

  getPublicKeyString(): string {
    return this.getPublicKey().toBase58();
  }

  async getBalance(): Promise<number> {
    if (!this.publicKey) {
      throw new Error('Wallet not initialized');
    }

    try {
      const balance = await this.connection.getBalance(this.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Error fetching balance:', error);
      throw error;
    }
  }

  async getWalletBalance(): Promise<WalletBalance> {
    const solBalance = await this.getBalance();

    // Get SOL price in USD (simplified - in production use price feed)
    const solPriceUSD = 100; // Placeholder - should fetch from API
    const usdBalance = solBalance * solPriceUSD;

    return {
      sol: solBalance,
      usd: usdBalance,
      tokens: [] // TODO: Implement token account fetching
    };
  }

  // ==========================================
  // TOKEN ACCOUNTS
  // ==========================================

  async getTokenAccounts(): Promise<TokenAccount[]> {
    if (!this.publicKey) {
      throw new Error('Wallet not initialized');
    }

    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      return accounts.value.map(account => {
        const parsed = account.account.data.parsed;
        return {
          mint: parsed.info.mint,
          address: account.pubkey.toBase58(),
          balance: parsed.info.tokenAmount.uiAmount,
          decimals: parsed.info.tokenAmount.decimals
        };
      });
    } catch (error) {
      logger.error('Error fetching token accounts:', error);
      return [];
    }
  }

  async getTokenBalance(mint: string): Promise<number> {
    if (!this.publicKey) {
      throw new Error('Wallet not initialized');
    }

    try {
      const mintPubkey = new PublicKey(mint);
      const tokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        this.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        const account = await getAccount(this.connection, tokenAccount);
        return Number(account.amount) / Math.pow(10, account.decimals);
      } catch (error) {
        // Account doesn't exist
        return 0;
      }
    } catch (error) {
      logger.error(`Error fetching token balance for ${mint}:`, error);
      return 0;
    }
  }

  async getOrCreateTokenAccount(mint: string): Promise<string> {
    if (!this.publicKey || !this.keypair) {
      throw new Error('Wallet not initialized');
    }

    const mintPubkey = new PublicKey(mint);
    const tokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      this.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      // Check if account exists
      await getAccount(this.connection, tokenAccount);
      return tokenAccount.toBase58();
    } catch (error) {
      // Create account
      logger.info(`Creating token account for mint ${mint}...`);

      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          this.publicKey,
          tokenAccount,
          this.publicKey,
          mintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      await sendAndConfirmTransaction(this.connection, transaction, [this.keypair]);

      logger.info(`✅ Token account created: ${tokenAccount.toBase58()}`);
      return tokenAccount.toBase58();
    }
  }

  // ==========================================
  // TRANSACTION SIGNING
  // ==========================================

  async signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this.keypair]);
      return transaction;
    } else {
      transaction.partialSign(this.keypair);
      return transaction;
    }
  }

  async signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    return transactions.map(tx => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([this.keypair!]);
        return tx;
      } else {
        tx.partialSign(this.keypair!);
        return tx;
      }
    });
  }

  // ==========================================
  // TRANSACTION SENDING
  // ==========================================

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    options: {
      maxRetries?: number;
      skipPreflight?: boolean;
      commitment?: 'processed' | 'confirmed' | 'finalized';
    } = {}
  ): Promise<string> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    const {
      maxRetries = 3,
      skipPreflight = false,
      commitment = 'confirmed'
    } = options;

    try {
      // Sign transaction
      const signedTx = await this.signTransaction(transaction);

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        signedTx.serialize(),
        {
          maxRetries,
          skipPreflight,
          preflightCommitment: commitment
        }
      );

      // Log truncated signature for privacy
      const truncatedSig = truncateAddress(signature, 6);
      logger.info(`📤 Transaction sent: ${truncatedSig}`);
      logger.debug(`Full signature: ${signature}`); // Only in debug mode

      // Wait for confirmation
      await this.confirmTransaction(signature, commitment);

      return signature;

    } catch (error) {
      logger.error('Error sending transaction:', error);
      throw error;
    }
  }

  async confirmTransaction(
    signature: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
    timeout: number = 60000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.connection.getSignatureStatus(signature);

        if (status.value?.confirmationStatus === commitment ||
            (commitment === 'confirmed' && status.value?.confirmationStatus === 'finalized')) {
          if (status.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
          }
          const truncatedConfirmSig = truncateAddress(signature, 6);
          logger.info(`✅ Transaction confirmed: ${truncatedConfirmSig}`);
          logger.debug(`Full confirmed signature: ${signature}`); // Only in debug mode
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Transaction confirmation timeout: ${signature}`);
  }

  // ==========================================
  // SIMULATION
  // ==========================================

  async simulateTransaction(transaction: Transaction | VersionedTransaction): Promise<{
    success: boolean;
    logs?: string[];
    error?: string;
  }> {
    if (!this.publicKey) {
      throw new Error('Wallet not initialized');
    }

    try {
      // Set fee payer
      if (transaction instanceof Transaction) {
        transaction.feePayer = this.publicKey;
      }

      const simulation = await this.connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        return {
          success: false,
          logs: simulation.value.logs,
          error: JSON.stringify(simulation.value.err)
        };
      }

      return {
        success: true,
        logs: simulation.value.logs
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==========================================
  // GAS OPTIMIZATION
  // ==========================================

  async getRecentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    return { blockhash, lastValidBlockHeight };
  }

  async getFeeForMessage(message: Uint8Array): Promise<number> {
    try {
      const fee = await this.connection.getFeeForMessage(message as Buffer);
      return fee.value || 0;
    } catch (error) {
      logger.warn('Could not estimate fee:', error);
      return 5000; // Default 0.000005 SOL
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async getConnection(): Promise<Connection> {
    return this.connection;
  }

  isInitialized(): boolean {
    return this.keypair !== null && this.publicKey !== null;
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async disconnect(): Promise<void> {
    // Clear sensitive data
    this.keypair = null;
    this.publicKey = null;
    logger.info('👋 Wallet service disconnected');
  }
}

export default WalletService;
