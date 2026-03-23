/**
 * RpcPoolManager.ts
 * BRD v3 §7.3 — Multi-RPC pool with automatic failover.
 * NEW in v3.0: 3-tier RPC pool (Primary → Secondary → Tertiary).
 * Health check via getSlot() every 30s. Failover if slot > 10 behind.
 */

import { Connection } from '@solana/web3.js';
import { logger } from '../utils/logger';

export type RpcTier = 'primary' | 'secondary' | 'tertiary';

export interface RpcEndpoint {
  tier: RpcTier;
  url: string;
  provider: string;
  healthy: boolean;
  latencyMs: number;
  lastSlot: number;
  lastChecked: Date | null;
  failureCount: number;
  failoverCount: number;
}

export interface RpcHealthStatus {
  currentTier: RpcTier;
  endpoints: RpcEndpoint[];
  totalFailovers: number;
  uptimeSeconds: number;
  lastFailover: Date | null;
}

export class RpcPoolManager {
  private endpoints: Map<RpcTier, RpcEndpoint> = new Map();
  private connections: Map<RpcTier, Connection> = new Map();
  private currentTier: RpcTier = 'primary';
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private totalFailovers = 0;
  private lastFailover: Date | null = null;
  private startedAt = new Date();

  // BRD v3 §7.3 constants
  private readonly CHECK_INTERVAL_MS = 30_000;
  private readonly MAX_SLOT_LAG = 10;
  private readonly MAX_FAILURES = 3;
  private readonly TIMEOUT_MS = 5_000;

  constructor() {
    const configs: Array<{ tier: RpcTier; envKey: string; provider: string; fallback?: string }> = [
      { tier: 'primary',   envKey: 'SOLANA_RPC_PRIMARY',   provider: 'Helius/QuickNode' },
      { tier: 'secondary', envKey: 'SOLANA_RPC_SECONDARY', provider: 'Triton/Alchemy' },
      { tier: 'tertiary',  envKey: 'SOLANA_RPC_TERTIARY',  provider: 'Solana Mainnet',
        fallback: 'https://api.mainnet-beta.solana.com' },
    ];

    for (const cfg of configs) {
      const url = process.env[cfg.envKey] ?? cfg.fallback ?? '';
      if (!url) {
        logger.warn(`[RpcPoolManager] ${cfg.tier} URL not set — skipped`);
        continue;
      }

      this.endpoints.set(cfg.tier, {
        tier: cfg.tier, url, provider: cfg.provider,
        healthy: true, latencyMs: 0, lastSlot: 0,
        lastChecked: null, failureCount: 0, failoverCount: 0,
      });

      this.connections.set(cfg.tier, new Connection(url, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: this.TIMEOUT_MS,
      }));
    }

    logger.info(`[RpcPoolManager] Configured ${this.endpoints.size} endpoints`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getConnection(): Connection {
    const conn = this.connections.get(this.currentTier);
    if (conn) return conn;
    for (const [, c] of this.connections) return c;
    throw new Error('[RpcPoolManager] No RPC connections available');
  }

  getCurrentTier(): RpcTier { return this.currentTier; }

  async initialize(): Promise<void> {
    await this.runHealthChecks();
    this.healthCheckInterval = setInterval(() => this.runHealthChecks(), this.CHECK_INTERVAL_MS);
    logger.info(`[RpcPoolManager] Ready. Active tier: ${this.currentTier}`);
  }

  stop(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    logger.info('[RpcPoolManager] Stopped');
  }

  async forceFailover(): Promise<RpcTier> {
    await this.triggerFailover('manual /rpc command');
    return this.currentTier;
  }

  getHealthStatus(): RpcHealthStatus {
    return {
      currentTier: this.currentTier,
      endpoints: Array.from(this.endpoints.values()),
      totalFailovers: this.totalFailovers,
      uptimeSeconds: this.lastFailover
        ? (Date.now() - this.lastFailover.getTime()) / 1000
        : (Date.now() - this.startedAt.getTime()) / 1000,
      lastFailover: this.lastFailover,
    };
  }

  // ── Health Checks ──────────────────────────────────────────────────────────

  private async runHealthChecks(): Promise<void> {
    let maxSlot = 0;

    // Pass 1: collect slots to find expected
    for (const [tier, conn] of this.connections) {
      try {
        const slot = await this.withTimeout(() => conn.getSlot());
        if (slot > maxSlot) maxSlot = slot;
        const ep = this.endpoints.get(tier)!;
        ep.lastSlot = slot;
        ep.lastChecked = new Date();
      } catch { /* handled in pass 2 */ }
    }

    // Pass 2: evaluate each endpoint
    for (const [tier, conn] of this.connections) {
      const ep = this.endpoints.get(tier)!;
      try {
        const t0 = Date.now();
        const slot = await this.withTimeout(() => conn.getSlot());
        ep.latencyMs = Date.now() - t0;
        ep.lastSlot = slot;
        ep.lastChecked = new Date();

        const lag = maxSlot - slot;
        if (lag > this.MAX_SLOT_LAG) {
          logger.warn(`[RpcPoolManager] ${tier} slot lag ${lag} — unhealthy`);
          ep.healthy = false;
          ep.failureCount++;
        } else {
          ep.healthy = true;
          ep.failureCount = 0;
        }
      } catch {
        ep.healthy = false;
        ep.failureCount++;
        logger.warn(`[RpcPoolManager] ${tier} health check failed (${ep.failureCount}/${this.MAX_FAILURES})`);
      }
    }

    // Failover if current tier degraded past threshold
    const cur = this.endpoints.get(this.currentTier);
    if (cur && !cur.healthy && cur.failureCount >= this.MAX_FAILURES) {
      await this.triggerFailover('health check threshold exceeded');
    }

    // Try to recover to a higher tier
    await this.tryRecoverToHigherTier();
  }

  private async triggerFailover(reason: string): Promise<void> {
    const order: RpcTier[] = ['primary', 'secondary', 'tertiary'];

    for (const tier of order) {
      if (tier === this.currentTier) continue;
      const ep = this.endpoints.get(tier);
      if (!ep) continue;

      try {
        await this.withTimeout(() => this.connections.get(tier)!.getSlot());
        const prev = this.currentTier;
        this.currentTier = tier;
        this.totalFailovers++;
        this.lastFailover = new Date();
        ep.failoverCount++;
        logger.warn(`[RpcPoolManager] FAILOVER ${prev} → ${tier} (${ep.provider}). Reason: ${reason}`);
        return;
      } catch {
        logger.warn(`[RpcPoolManager] Failover to ${tier} also failed`);
      }
    }

    logger.error('[RpcPoolManager] ALL tiers failed — staying on tertiary as last resort');
    this.currentTier = 'tertiary';
  }

  private async tryRecoverToHigherTier(): Promise<void> {
    const order: RpcTier[] = ['primary', 'secondary', 'tertiary'];
    const idx = order.indexOf(this.currentTier);
    if (idx === 0) return;

    for (let i = 0; i < idx; i++) {
      const ep = this.endpoints.get(order[i]);
      if (ep?.healthy && ep.failureCount === 0) {
        logger.info(`[RpcPoolManager] Recovering to ${order[i]} — healthy again`);
        this.currentTier = order[i];
        return;
      }
    }
  }

  private withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), this.TIMEOUT_MS)
      ),
    ]);
  }
}
