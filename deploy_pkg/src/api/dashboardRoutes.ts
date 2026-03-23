/**
 * dashboardRoutes.ts
 * REST API endpoints for the web dashboard per BRD section 9.
 * Gap fix: APIServer previously a skeleton. This adds typed,
 * validated routes for all 5 dashboard views (DASH-001 to DASH-005).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Route registration ────────────────────────────────────────────────────────

export async function registerDashboardRoutes(
  fastify: FastifyInstance,
  deps: DashboardDeps
): Promise<void> {

  // ── DASH-001: Overview ────────────────────────────────────────────────────
  fastify.get('/api/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const status = await deps.getSystemStatus();
    return reply.send({ success: true, data: status });
  });

  fastify.get('/api/balance', async (_req: FastifyRequest, reply: FastifyReply) => {
    const balance = await deps.getBalance();
    return reply.send({ success: true, data: balance });
  });

  // ── DASH-002: Position Monitor ────────────────────────────────────────────
  fastify.get('/api/positions', async (_req: FastifyRequest, reply: FastifyReply) => {
    const positions = await deps.getPositions();
    return reply.send({ success: true, data: positions, count: positions.length });
  });

  fastify.get('/api/positions/:id', async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const position = await deps.getPosition(req.params.id);
    if (!position) return reply.status(404).send({ success: false, error: 'Position not found' });
    return reply.send({ success: true, data: position });
  });

  fastify.post('/api/positions/:id/rebalance', async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    await deps.rebalancePosition(req.params.id);
    return reply.send({ success: true, message: 'Rebalance triggered' });
  });

  fastify.post('/api/positions/:id/exit', async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    await deps.exitPosition(req.params.id);
    return reply.send({ success: true, message: 'Exit triggered' });
  });

  // ── DASH-003: Performance Analytics ──────────────────────────────────────
  fastify.get('/api/pnl', async (
    req: FastifyRequest<{ Querystring: { period?: string } }>,
    reply: FastifyReply
  ) => {
    const period = req.query.period ?? 'daily';
    const pnl = await deps.getPnL(period as 'daily' | 'weekly' | 'monthly');
    return reply.send({ success: true, data: pnl });
  });

  fastify.get('/api/performance', async (
    req: FastifyRequest<{ Querystring: { days?: string } }>,
    reply: FastifyReply
  ) => {
    const days = parseInt(req.query.days ?? '30', 10);
    const performance = await deps.getPerformanceHistory(days);
    return reply.send({ success: true, data: performance });
  });

  fastify.get('/api/performance/targets', async (_req, reply) => {
    const targets = await deps.getPerformanceTargets();
    return reply.send({ success: true, data: targets });
  });

  // ── DASH-004: AI Insights ─────────────────────────────────────────────────
  fastify.get('/api/ai/decisions', async (
    req: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ) => {
    const limit = parseInt(req.query.limit ?? '20', 10);
    const decisions = await deps.getAIDecisions(limit);
    return reply.send({ success: true, data: decisions });
  });

  fastify.get('/api/ai/accuracy', async (_req, reply) => {
    const accuracy = await deps.getAIAccuracy();
    return reply.send({ success: true, data: accuracy });
  });

  fastify.get('/api/ai/weights', async (_req, reply) => {
    const weights = deps.getModelWeights();
    return reply.send({ success: true, data: weights });
  });

  fastify.get('/api/ai/best-pools', async (_req, reply) => {
    const pools = await deps.getBestPools();
    return reply.send({ success: true, data: pools });
  });

  // ── DASH-005: Risk Dashboard ──────────────────────────────────────────────
  fastify.get('/api/risk/exposure', async (_req, reply) => {
    const exposure = await deps.getExposure();
    return reply.send({ success: true, data: exposure });
  });

  fastify.get('/api/risk/circuit-breakers', async (_req, reply) => {
    const cbs = deps.getCircuitBreakerStatus();
    return reply.send({ success: true, data: cbs });
  });

  fastify.get('/api/risk/alerts', async (
    req: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ) => {
    const limit = parseInt(req.query.limit ?? '50', 10);
    const alerts = await deps.getRiskAlerts(limit);
    return reply.send({ success: true, data: alerts });
  });

  // ── Bot Control ───────────────────────────────────────────────────────────
  fastify.post('/api/bot/start', async (_req, reply) => {
    await deps.startBot();
    return reply.send({ success: true, message: 'Bot started' });
  });

  fastify.post('/api/bot/stop', async (_req, reply) => {
    await deps.stopBot();
    return reply.send({ success: true, message: 'Bot stopped' });
  });

  fastify.post('/api/bot/emergency', async (_req, reply) => {
    await deps.emergencyStop();
    return reply.send({ success: true, message: 'Emergency stop executed' });
  });

  // ── Pools ─────────────────────────────────────────────────────────────────
  fastify.get('/api/pools/top', async (
    req: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ) => {
    const limit = parseInt(req.query.limit ?? '10', 10);
    const pools = await deps.getTopPools(limit);
    return reply.send({ success: true, data: pools });
  });

  // ── Health ────────────────────────────────────────────────────────────────
  fastify.get('/health', async (_req, reply) => {
    const health = await deps.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  fastify.get('/metrics', async (_req, reply) => {
    const metrics = await deps.getPrometheusMetrics();
    return reply.type('text/plain').send(metrics);
  });
}

// ─── Dependency interface ──────────────────────────────────────────────────────

export interface DashboardDeps {
  getSystemStatus: () => Promise<unknown>;
  getBalance: () => Promise<unknown>;
  getPositions: () => Promise<unknown[]>;
  getPosition: (id: string) => Promise<unknown | null>;
  rebalancePosition: (id: string) => Promise<void>;
  exitPosition: (id: string) => Promise<void>;
  getPnL: (period: 'daily' | 'weekly' | 'monthly') => Promise<unknown>;
  getPerformanceHistory: (days: number) => Promise<unknown[]>;
  getPerformanceTargets: () => Promise<unknown[]>;
  getAIDecisions: (limit: number) => Promise<unknown[]>;
  getAIAccuracy: () => Promise<unknown>;
  getModelWeights: () => unknown;
  getBestPools: () => Promise<string[]>;
  getExposure: () => Promise<unknown>;
  getCircuitBreakerStatus: () => unknown;
  getRiskAlerts: (limit: number) => Promise<unknown[]>;
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  emergencyStop: () => Promise<void>;
  getTopPools: (limit: number) => Promise<unknown[]>;
  getHealth: () => Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    database: string;
    redis: string;
    solana: string;
    positions: number;
    daily_pnl: number;
  }>;
  getPrometheusMetrics: () => Promise<string>;
}
