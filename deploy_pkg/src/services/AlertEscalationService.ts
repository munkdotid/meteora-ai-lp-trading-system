/**
 * AlertEscalationService.ts
 * BRD v3 §11 — Alert escalation matrix with 4 severity tiers + multi-channel.
 * NEW in v3.0: P0–P3 severity tiers, Twilio SMS fallback for P0,
 * Dead Man's Switch integration, dashboard push notifications.
 */

import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertChannel = 'telegram' | 'sms' | 'email' | 'dashboard_push';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  autoAction?: string;
  timestamp: Date;
  acknowledged: boolean;
  channels: AlertChannel[];
}

export interface AlertDeps {
  sendTelegram: (message: string, urgent?: boolean) => Promise<boolean>;
  sendSms: (message: string, toPhone: string) => Promise<boolean>;
  sendEmail: (subject: string, body: string) => Promise<boolean>;
  pushToDashboard: (alert: Alert) => void;
  triggerKillSwitch: () => Promise<void>;
  pauseNewEntries: () => void;
}

// BRD v3 §11.1 — Alert severity configuration
const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string;
  channels: AlertChannel[];
  slaSecs: number;
  autoAction?: string;
  telegramFallbackSecs?: number;
}> = {
  P0: {
    label: 'Critical',
    channels: ['telegram', 'sms', 'dashboard_push'],
    slaSecs: 120,           // < 2 minutes
    autoAction: 'kill_switch',
    telegramFallbackSecs: 120, // send SMS if Telegram unresponsive > 2 min
  },
  P1: {
    label: 'High',
    channels: ['telegram', 'dashboard_push'],
    slaSecs: 900,           // < 15 minutes
    autoAction: 'position_review_mode',
  },
  P2: {
    label: 'Medium',
    channels: ['telegram', 'dashboard_push'],
    slaSecs: 3600,          // < 1 hour
  },
  P3: {
    label: 'Info',
    channels: ['telegram', 'dashboard_push'],
    slaSecs: 86400,         // next business day
  },
};

// ─── AlertEscalationService ───────────────────────────────────────────────────

export class AlertEscalationService {
  private deps: AlertDeps;
  private alertHistory: Alert[] = [];
  private pendingTelegramAlerts: Map<string, { alert: Alert; sentAt: Date }> = new Map();
  private smsPhone: string;

  constructor(deps: AlertDeps) {
    this.deps = deps;
    this.smsPhone = process.env.TWILIO_PHONE_TO ?? '';
  }

  // ── Core Alert Dispatch ────────────────────────────────────────────────────

  async fire(params: {
    severity: AlertSeverity;
    title: string;
    message: string;
    autoAction?: boolean;
  }): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      severity: params.severity,
      title: params.title,
      message: params.message,
      autoAction: SEVERITY_CONFIG[params.severity].autoAction,
      timestamp: new Date(),
      acknowledged: false,
      channels: SEVERITY_CONFIG[params.severity].channels,
    };

    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > 500) this.alertHistory.pop();

    logger.warn(`[AlertEscalation] ${params.severity} ALERT: ${params.title}`);

    // Dispatch to channels
    await this.dispatch(alert);

    // Execute auto-action if applicable and requested
    if (params.autoAction !== false && alert.autoAction) {
      await this.executeAutoAction(alert);
    }

    return alert;
  }

  private async dispatch(alert: Alert): Promise<void> {
    const cfg = SEVERITY_CONFIG[alert.severity];
    const formatted = this.formatMessage(alert);

    // Telegram (primary for all tiers)
    if (cfg.channels.includes('telegram')) {
      const telegramSent = await this.deps.sendTelegram(formatted, alert.severity === 'P0');

      if (!telegramSent && alert.severity === 'P0' && this.smsPhone) {
        // BRD: SMS fallback immediately on P0 Telegram failure
        logger.warn('[AlertEscalation] Telegram failed for P0 — sending SMS immediately');
        await this.deps.sendSms(this.formatSms(alert), this.smsPhone);
      }

      if (telegramSent && alert.severity === 'P0') {
        // Track for delayed SMS fallback check
        this.pendingTelegramAlerts.set(alert.id, { alert, sentAt: new Date() });
        this.scheduleSmsFallback(alert, cfg.telegramFallbackSecs!);
      }
    }

    // SMS for P0 (in addition to Telegram)
    if (cfg.channels.includes('sms') && this.smsPhone && alert.severity === 'P0') {
      await this.deps.sendSms(this.formatSms(alert), this.smsPhone);
    }

    // Dashboard push
    if (cfg.channels.includes('dashboard_push')) {
      this.deps.pushToDashboard(alert);
    }
  }

  // BRD v3 §11.2: if no response to P0 Telegram within 2 min, send SMS
  private scheduleSmsFallback(alert: Alert, delaySecs: number): void {
    setTimeout(async () => {
      if (this.pendingTelegramAlerts.has(alert.id) && !alert.acknowledged) {
        logger.warn(`[AlertEscalation] P0 alert ${alert.id} unacknowledged after ${delaySecs}s — SMS fallback`);
        if (this.smsPhone) {
          await this.deps.sendSms(this.formatSms(alert), this.smsPhone);
        }
      }
    }, delaySecs * 1000);
  }

  private async executeAutoAction(alert: Alert): Promise<void> {
    switch (alert.autoAction) {
      case 'kill_switch':
        logger.error('[AlertEscalation] P0 auto-action: triggering kill switch');
        await this.deps.triggerKillSwitch();
        break;
      case 'position_review_mode':
        logger.warn('[AlertEscalation] P1 auto-action: pausing new entries');
        this.deps.pauseNewEntries();
        break;
    }
  }

  acknowledge(alertId: string): void {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.pendingTelegramAlerts.delete(alertId);
      logger.info(`[AlertEscalation] Alert acknowledged: ${alertId}`);
    }
  }

  // ── Pre-built Alert Constructors (matching BRD event types) ───────────────

  async fireEmergencyExit(reason: string): Promise<Alert> {
    return this.fire({ severity: 'P0', title: 'Emergency Exit Triggered', message: reason });
  }

  async fireDrawdownBreach(drawdownPct: number): Promise<Alert> {
    return this.fire({
      severity: 'P0',
      title: 'Max Drawdown Breached',
      message: `Portfolio drawdown ${(drawdownPct * 100).toFixed(1)}% exceeds 10% threshold. Emergency exit all positions.`,
    });
  }

  async fireDailyLossHigh(lossPct: number): Promise<Alert> {
    return this.fire({
      severity: 'P1',
      title: 'Daily Loss Warning',
      message: `Daily loss ${(lossPct * 100).toFixed(2)}% approaching 5% circuit breaker.`,
      autoAction: false, // P1 doesn't auto-execute, just review mode
    });
  }

  async fireILAlert(positionId: string, ilPct: number): Promise<Alert> {
    return this.fire({
      severity: ilPct > 0.05 ? 'P1' : 'P2',
      title: `IL ${ilPct > 0.05 ? 'Critical' : 'Warning'}: ${positionId.slice(0, 8)}...`,
      message: `Impermanent loss ${(ilPct * 100).toFixed(2)}% on position ${positionId}.`,
      autoAction: false,
    });
  }

  async fireApiFailure(service: string, count: number): Promise<Alert> {
    return this.fire({
      severity: 'P1',
      title: `API Failures: ${service}`,
      message: `${count} consecutive failures from ${service}. Trading paused.`,
    });
  }

  async fireRpcFailover(from: string, to: string): Promise<Alert> {
    return this.fire({
      severity: 'P2',
      title: 'RPC Failover',
      message: `RPC endpoint switched: ${from} → ${to}.`,
      autoAction: false,
    });
  }

  async fireRebalance(pair: string, reason: string): Promise<Alert> {
    return this.fire({ severity: 'P2', title: `Rebalanced: ${pair}`, message: reason, autoAction: false });
  }

  async fireDailyReport(summary: string): Promise<Alert> {
    return this.fire({ severity: 'P3', title: 'Daily Performance Report', message: summary, autoAction: false });
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  private formatMessage(alert: Alert): string {
    const icons: Record<AlertSeverity, string> = { P0: '🚨', P1: '⚠️', P2: '♻️', P3: '📊' };
    return `${icons[alert.severity]} *[${alert.severity}] ${alert.title}*\n\n${alert.message}\n\n_${alert.timestamp.toISOString()}_`;
  }

  private formatSms(alert: Alert): string {
    return `[${alert.severity}] ${alert.title}: ${alert.message.slice(0, 160)}`;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getAlertHistory(limit = 50): Alert[] {
    return this.alertHistory.slice(0, limit);
  }

  getUnacknowledgedP0(): Alert[] {
    return this.alertHistory.filter(a => a.severity === 'P0' && !a.acknowledged);
  }
}
