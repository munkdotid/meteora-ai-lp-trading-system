/**
 * MultiWalletService.ts
 * BRD v3 §9 — Multi-wallet architecture.
 * NEW in v3.0: Hot Primary (30%), Hot Secondary (30%), Warm (40%), Cold (overflow).
 * Auto-failover if primary < 0.05 SOL. Auto-refill from warm if hot < 0.5 SOL.
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletRole = 'hot_primary' | 'hot_secondary' | 'warm' | 'cold';

export interface WalletInfo {
  role: WalletRole;
  publicKey: string;
  balanceSol: number;
  balanceUsd: number;
  isActive: boolean;
  lastHealthCheck: Date | null;
  txCount: number;
}

export interface WalletHealthStatus {
  activeWallet: WalletRole;
  wallets: WalletInfo[];
  lastFailover: Date | null;
  lastRefill: Date | null;
  totalFailovers: number;
}

// ─── MultiWalletService ───────────────────────────────────────────────────────

export class MultiWalletService {
  private wallets: Map<WalletRole, Keypair | null> = new Map();
  private balances: Map<WalletRole, number> = new Map();
  private activeWallet: WalletRole = 'hot_primary';
  private connection: Connection;
  private solUsdPrice: number;

  private lastFailover: Date | null = null;
  private lastRefill: Date | null = null;
  private totalFailovers = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // BRD v3 §9.2 thresholds
  private readonly GAS_RESERVE_FAILOVER_SOL = 0.05;  // failover if primary < 0.05
  private readonly REFILL_TRIGGER_SOL = 0.5;          // refill hot wallets if < 0.5
  private readonly REFILL_AMOUNT_SOL = 1.0;           // transfer 1 SOL from warm
  private readonly HEALTH_CHECK_INTERVAL_MS = 60_000;

  constructor(connection: Connection, solUsdPrice = 150) {
    this.connection = connection;
    this.solUsdPrice = solUsdPrice;
    this.loadWallets();
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  private loadWallets(): void {
    // Load keys from Vault/KMS (env var as placeholder per BRD §9.3)
    const keyConfigs: Array<{ role: WalletRole; envKey: string }> = [
      { role: 'hot_primary',   envKey: 'WALLET_HOT_PRIMARY_KEY' },
      { role: 'hot_secondary', envKey: 'WALLET_HOT_SECONDARY_KEY' },
      { role: 'warm',          envKey: 'WALLET_WARM_KEY' },
      { role: 'cold',          envKey: 'WALLET_COLD_KEY' },
    ];

    for (const cfg of keyConfigs) {
      const keyStr = process.env[cfg.envKey];
      if (keyStr) {
        try {
          const secretKey = Uint8Array.from(JSON.parse(keyStr));
          this.wallets.set(cfg.role, Keypair.fromSecretKey(secretKey));
          logger.info(`[MultiWalletService] ${cfg.role} wallet loaded`);
        } catch (err) {
          logger.warn(`[MultiWalletService] Failed to load ${cfg.role} wallet: ${err}`);
          this.wallets.set(cfg.role, null);
        }
      } else {
        logger.warn(`[MultiWalletService] ${cfg.envKey} not set — ${cfg.role} wallet unavailable`);
        this.wallets.set(cfg.role, null);
      }
    }
  }

  async initialize(): Promise<void> {
    await this.refreshAllBalances();
    this.healthCheckInterval = setInterval(() => this.runHealthChecks(), this.HEALTH_CHECK_INTERVAL_MS);
    logger.info(`[MultiWalletService] Initialized. Active: ${this.activeWallet}`);
  }

  stop(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getActiveKeypair(): Keypair {
    const kp = this.wallets.get(this.activeWallet);
    if (!kp) throw new Error(`[MultiWalletService] Active wallet ${this.activeWallet} has no keypair`);
    return kp;
  }

  getActivePublicKey(): PublicKey {
    return this.getActiveKeypair().publicKey;
  }

  getActiveWallet(): WalletRole {
    return this.activeWallet;
  }

  async getBalance(role: WalletRole = this.activeWallet): Promise<number> {
    return this.balances.get(role) ?? 0;
  }

  // ── Health Checks & Auto-Failover ──────────────────────────────────────────

  async runHealthChecks(): Promise<void> {
    await this.refreshAllBalances();

    const primaryBalance = this.balances.get('hot_primary') ?? 0;
    const secondaryBalance = this.balances.get('hot_secondary') ?? 0;

    // BRD v3 §9.2: failover if primary gas reserve < 0.05 SOL
    if (this.activeWallet === 'hot_primary' && primaryBalance < this.GAS_RESERVE_FAILOVER_SOL) {
      logger.warn(`[MultiWalletService] Primary balance ${primaryBalance.toFixed(4)} SOL < threshold — failover to secondary`);
      await this.switchToWallet('hot_secondary');
    }

    // BRD v3 §9.2: auto-refill hot wallets from warm if balance < 0.5 SOL
    if (primaryBalance < this.REFILL_TRIGGER_SOL) {
      await this.refillFromWarm('hot_primary');
    }
    if (secondaryBalance < this.REFILL_TRIGGER_SOL) {
      await this.refillFromWarm('hot_secondary');
    }
  }

  private async refreshAllBalances(): Promise<void> {
    const roles: WalletRole[] = ['hot_primary', 'hot_secondary', 'warm', 'cold'];
    for (const role of roles) {
      const kp = this.wallets.get(role);
      if (!kp) continue;
      try {
        const lamports = await this.connection.getBalance(kp.publicKey);
        this.balances.set(role, lamports / LAMPORTS_PER_SOL);
      } catch (err) {
        logger.warn(`[MultiWalletService] Failed to fetch balance for ${role}: ${err}`);
      }
    }
  }

  private async switchToWallet(role: WalletRole): Promise<void> {
    const kp = this.wallets.get(role);
    if (!kp) {
      logger.error(`[MultiWalletService] Cannot switch to ${role} — no keypair available`);
      return;
    }

    const prev = this.activeWallet;
    this.activeWallet = role;
    this.lastFailover = new Date();
    this.totalFailovers++;

    logger.warn(`[MultiWalletService] WALLET FAILOVER: ${prev} → ${role}`);
  }

  // BRD v3 §9.2: warm wallet auto-refills hot wallets
  private async refillFromWarm(targetRole: WalletRole): Promise<void> {
    const warmKp = this.wallets.get('warm');
    const targetKp = this.wallets.get(targetRole);
    if (!warmKp || !targetKp) return;

    const warmBalance = this.balances.get('warm') ?? 0;
    if (warmBalance < this.REFILL_AMOUNT_SOL + 0.01) {
      logger.warn(`[MultiWalletService] Warm wallet insufficient for refill: ${warmBalance.toFixed(4)} SOL`);
      return;
    }

    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: warmKp.publicKey,
          toPubkey: targetKp.publicKey,
          lamports: this.REFILL_AMOUNT_SOL * LAMPORTS_PER_SOL,
        })
      );

      const sig = await this.connection.sendTransaction(transaction, [warmKp]);
      this.lastRefill = new Date();

      logger.info(`[MultiWalletService] Refilled ${targetRole} with ${this.REFILL_AMOUNT_SOL} SOL from warm. TX: ${sig}`);
      await this.refreshAllBalances();
    } catch (err) {
      logger.error(`[MultiWalletService] Refill failed for ${targetRole}: ${err}`);
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  getHealthStatus(): WalletHealthStatus {
    const roles: WalletRole[] = ['hot_primary', 'hot_secondary', 'warm', 'cold'];
    const walletInfos: WalletInfo[] = roles.map(role => {
      const kp = this.wallets.get(role);
      const balance = this.balances.get(role) ?? 0;
      return {
        role,
        publicKey: kp ? kp.publicKey.toBase58().slice(0, 8) + '...' : 'not configured',
        balanceSol: balance,
        balanceUsd: balance * this.solUsdPrice,
        isActive: role === this.activeWallet,
        lastHealthCheck: new Date(),
        txCount: 0,
      };
    });

    return {
      activeWallet: this.activeWallet,
      wallets: walletInfos,
      lastFailover: this.lastFailover,
      lastRefill: this.lastRefill,
      totalFailovers: this.totalFailovers,
    };
  }

  updateSolPrice(price: number): void {
    this.solUsdPrice = price;
  }
}
