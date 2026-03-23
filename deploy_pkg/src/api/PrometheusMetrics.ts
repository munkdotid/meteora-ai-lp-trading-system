/**
 * PrometheusMetrics.ts
 * Exposes BRD section 9 KPIs as Prometheus metrics.
 * Enables external monitoring via Grafana or similar dashboards.
 */

export class PrometheusMetrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  // ── Setters ────────────────────────────────────────────────────────────────

  setPositionsTotal(n: number): void {
    this.gauges.set('meteora_positions_total', n);
  }

  setDailyPnl(pct: number): void {
    this.gauges.set('meteora_pnl_daily', pct);
  }

  incrementTrades(strategy: string): void {
    const key = `meteora_trades_total{strategy="${strategy}"}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  setAIConfidence(confidence: number): void {
    this.gauges.set('meteora_ai_confidence', confidence);
  }

  setWinRate(rate: number): void {
    this.gauges.set('meteora_win_rate', rate);
  }

  setSharpeRatio(ratio: number): void {
    this.gauges.set('meteora_sharpe_ratio', ratio);
  }

  setMaxDrawdown(dd: number): void {
    this.gauges.set('meteora_max_drawdown', dd);
  }

  setBalance(usd: number): void {
    this.gauges.set('meteora_balance_usd', usd);
  }

  recordTradeExecutionTime(ms: number): void {
    const key = 'meteora_trade_execution_ms';
    const arr = this.histograms.get(key) ?? [];
    arr.push(ms);
    if (arr.length > 1000) arr.shift();
    this.histograms.set(key, arr);
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  serialize(): string {
    const lines: string[] = [
      '# HELP meteora_positions_total Number of active LP positions',
      '# TYPE meteora_positions_total gauge',
      '# HELP meteora_pnl_daily Daily PnL percentage',
      '# TYPE meteora_pnl_daily gauge',
      '# HELP meteora_trades_total Total trades executed',
      '# TYPE meteora_trades_total counter',
      '# HELP meteora_ai_confidence Average AI confidence score',
      '# TYPE meteora_ai_confidence gauge',
      '# HELP meteora_win_rate Trade win rate 0-1',
      '# TYPE meteora_win_rate gauge',
      '# HELP meteora_sharpe_ratio Annualised Sharpe ratio',
      '# TYPE meteora_sharpe_ratio gauge',
      '# HELP meteora_max_drawdown Maximum drawdown 0-1',
      '# TYPE meteora_max_drawdown gauge',
      '# HELP meteora_balance_usd Portfolio balance in USD',
      '# TYPE meteora_balance_usd gauge',
      '',
    ];

    for (const [key, value] of this.gauges) {
      lines.push(`${key} ${value}`);
    }

    for (const [key, value] of this.counters) {
      lines.push(`${key} ${value}`);
    }

    // Histogram summaries (p50, p95, p99)
    for (const [key, values] of this.histograms) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.50)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      lines.push(`${key}{quantile="0.5"} ${p50}`);
      lines.push(`${key}{quantile="0.95"} ${p95}`);
      lines.push(`${key}{quantile="0.99"} ${p99}`);
    }

    return lines.join('\n');
  }
}
