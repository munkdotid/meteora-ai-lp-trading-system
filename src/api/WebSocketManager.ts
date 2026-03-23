/**
 * WebSocketManager.ts
 * Full implementation of real-time WebSocket events per BRD section 9.2.
 * Gap fix: Previously only a stub. Now emits all 7 event types with
 * correct frequencies and typed payloads.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';

// ─── Event Types (BRD section 9.2) ───────────────────────────────────────────

export interface PriceUpdateEvent {
  pair: string;
  price: number;
  change24h: number;
  timestamp: number;
}

export interface PositionUpdateEvent {
  positionId: string;
  poolAddress: string;
  pair: string;
  pnl: {
    usd: number;
    percentage: number;
  };
  feesEarned: number;
  impermanentLoss: number;
  inRange: boolean;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  timestamp: number;
}

export interface BalanceUpdateEvent {
  sol: number;
  usd: number;
  timestamp: number;
}

export interface AIDecisionEvent {
  pool: string;
  pair: string;
  action: 'ENTER' | 'EXIT' | 'SKIP' | 'REBALANCE';
  strategy: string;
  confidence: number;
  expectedApr: number;
  timestamp: number;
}

export interface TradeExecutedEvent {
  type: 'entry' | 'exit' | 'rebalance';
  positionId: string;
  pair: string;
  amount: number;
  txSignature: string;
  timestamp: number;
}

export interface RiskAlertEvent {
  level: 'warning' | 'critical';
  type: string;
  message: string;
  timestamp: number;
}

export interface SystemStatusEvent {
  status: 'running' | 'paused' | 'stopped' | 'error';
  uptime: number;
  activePositions: number;
  dailyPnl: number;
  winRate: number;
  sharpeRatio: number;
  timestamp: number;
}

// BRD update frequencies (ms)
const FREQUENCIES = {
  price:       3_000,
  position:   30_000,
  balance:    60_000,
  aiDecision: 180_000,
  systemStatus: 10_000,
};

// ─── WebSocketManager ─────────────────────────────────────────────────────────

export class WebSocketManager {
  private io: SocketIOServer | null = null;
  private connectedClients: Set<string> = new Set();
  private intervals: NodeJS.Timeout[] = [];

  // Data providers — injected to keep this class decoupled
  private getPrices: (() => Promise<PriceUpdateEvent[]>) | null = null;
  private getPositions: (() => Promise<PositionUpdateEvent[]>) | null = null;
  private getBalance: (() => Promise<BalanceUpdateEvent>) | null = null;
  private getSystemStatus: (() => Promise<SystemStatusEvent>) | null = null;

  // ── Setup ──────────────────────────────────────────────────────────────────

  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('[WebSocketManager] Initialized');
  }

  registerDataProviders(providers: {
    getPrices: () => Promise<PriceUpdateEvent[]>;
    getPositions: () => Promise<PositionUpdateEvent[]>;
    getBalance: () => Promise<BalanceUpdateEvent>;
    getSystemStatus: () => Promise<SystemStatusEvent>;
  }): void {
    this.getPrices = providers.getPrices;
    this.getPositions = providers.getPositions;
    this.getBalance = providers.getBalance;
    this.getSystemStatus = providers.getSystemStatus;
  }

  startBroadcasting(): void {
    // Price updates every 3s
    this.intervals.push(setInterval(async () => {
      if (!this.getPrices || this.connectedClients.size === 0) return;
      try {
        const prices = await this.getPrices();
        prices.forEach(p => this.emit('price_update', p));
      } catch (err) {
        logger.debug('[WebSocketManager] Price broadcast error:', err);
      }
    }, FREQUENCIES.price));

    // Position updates every 30s
    this.intervals.push(setInterval(async () => {
      if (!this.getPositions || this.connectedClients.size === 0) return;
      try {
        const positions = await this.getPositions();
        positions.forEach(p => this.emit('position_update', p));
      } catch (err) {
        logger.debug('[WebSocketManager] Position broadcast error:', err);
      }
    }, FREQUENCIES.position));

    // Balance updates every 60s
    this.intervals.push(setInterval(async () => {
      if (!this.getBalance || this.connectedClients.size === 0) return;
      try {
        const balance = await this.getBalance();
        this.emit('balance_update', balance);
      } catch (err) {
        logger.debug('[WebSocketManager] Balance broadcast error:', err);
      }
    }, FREQUENCIES.balance));

    // System status every 10s
    this.intervals.push(setInterval(async () => {
      if (!this.getSystemStatus || this.connectedClients.size === 0) return;
      try {
        const status = await this.getSystemStatus();
        this.emit('system_status', status);
      } catch (err) {
        logger.debug('[WebSocketManager] Status broadcast error:', err);
      }
    }, FREQUENCIES.systemStatus));

    logger.info('[WebSocketManager] Broadcasting started');
  }

  stop(): void {
    this.intervals.forEach(i => clearInterval(i));
    this.intervals = [];
    this.io?.close();
    logger.info('[WebSocketManager] Stopped');
  }

  // ── Manual Emits (called by TradingEngine/RiskManager) ────────────────────

  emitAIDecision(decision: AIDecisionEvent): void {
    this.emit('ai_decision', decision);
  }

  emitTradeExecuted(trade: TradeExecutedEvent): void {
    this.emit('trade_executed', trade);
  }

  emitRiskAlert(alert: RiskAlertEvent): void {
    this.emit('risk_alert', alert);
    logger.warn(`[WebSocketManager] Risk alert broadcast: [${alert.level}] ${alert.message}`);
  }

  emitPositionUpdate(update: PositionUpdateEvent): void {
    this.emit('position_update', update);
  }

  // ── Connection Handling ────────────────────────────────────────────────────

  private handleConnection(socket: Socket): void {
    this.connectedClients.add(socket.id);
    logger.info(`[WebSocketManager] Client connected: ${socket.id} (total: ${this.connectedClients.size})`);

    // Send immediate status snapshot on connect
    if (this.getSystemStatus) {
      this.getSystemStatus()
        .then(status => socket.emit('system_status', status))
        .catch(() => {});
    }

    // Channel subscription handling
    socket.on('subscribe', (data: { channel: string }) => {
      socket.join(data.channel);
      logger.debug(`[WebSocketManager] ${socket.id} subscribed to: ${data.channel}`);
    });

    socket.on('unsubscribe', (data: { channel: string }) => {
      socket.leave(data.channel);
    });

    // Ping/pong for latency measurement
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      this.connectedClients.delete(socket.id);
      logger.info(`[WebSocketManager] Client disconnected: ${socket.id} (total: ${this.connectedClients.size})`);
    });

    socket.on('error', (err) => {
      logger.error(`[WebSocketManager] Socket error for ${socket.id}:`, err);
    });
  }

  private emit(event: string, data: unknown): void {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }
}
