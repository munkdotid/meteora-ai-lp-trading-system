// ==========================================
// NOTIFICATION SERVICE
// Sends notifications via Telegram and other channels
// ==========================================

import { RedisService } from './RedisService';
import { logger } from '../utils/logger';
import {
  Position,
  NotificationPayload,
  AIDecision,
  Pool,
  Trade,
} from '../types';

export class NotificationService {
  private redis: RedisService;
  private queueName: string = 'notifications';

  constructor(redis: RedisService) {
    this.redis = redis;
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async initialize(): Promise<void> {
    logger.info('📱 Initializing notification service...');

    try {
      // Initialize notification queue
      this.redis.getQueue(this.queueName);

      logger.info('✅ Notification service initialized');

    } catch (error) {
      logger.error('❌ Failed to initialize notification service:', error);
      throw error;
    }
  }

  // ==========================================
  // TELEGRAM NOTIFICATIONS
  // ==========================================

  async notifyEntry(position: Position): Promise<void> {
    const payload: NotificationPayload = {
      type: 'entry',
      title: '🚀 New Position Opened',
      message: `
🏊 ${position.poolAddress.slice(0, 8)}...
💰 Investment: $${position.investment.usd.toFixed(2)}
📊 Range: ${position.range.lower.toFixed(4)} - ${position.range.upper.toFixed(4)}
🤖 Strategy: ${position.strategy}
⭐ AI Confidence: ${(position.aiConfidence * 100).toFixed(0)}%
      `.trim(),
      data: position,
    };

    await this.queueNotification(payload);
    logger.info(`📱 Entry notification queued for position ${position.id}`);
  }

  async notifyExit(position: Position): Promise<void> {
    const payload: NotificationPayload = {
      type: 'exit',
      title: '🚪 Position Closed',
      message: `
🏊 ${position.poolAddress.slice(0, 8)}...
🎯 PnL: ${position.pnl.percentage.toFixed(2)}% ($${position.pnl.realized.toFixed(2)})
💸 Fees: $${position.feesEarned.usd.toFixed(2)}
⏱️ Duration: ${this.calculateDuration(position.entryTime, position.exitTime)}
      `.trim(),
      data: position,
    };

    await this.queueNotification(payload);
    logger.info(`📱 Exit notification queued for position ${position.id}`);
  }

  async notifyRebalance(position: Position, reason: string): Promise<void> {
    const payload: NotificationPayload = {
      type: 'rebalance',
      title: '🔄 Rebalance Executed',
      message: `
🏊 ${position.poolAddress.slice(0, 8)}...
🎯 Reason: ${reason}
📊 New Range: ${position.range.lower.toFixed(4)} - ${position.range.upper.toFixed(4)}
💰 Current PnL: ${position.pnl.percentage.toFixed(2)}%
      `.trim(),
      data: { position, reason },
    };

    await this.queueNotification(payload);
    logger.info(`📱 Rebalance notification queued for position ${position.id}`);
  }

  async notifyProfit(position: Position): Promise<void> {
    const payload: NotificationPayload = {
      type: 'profit',
      title: '💰 Profit Target Reached!',
      message: `
🏊 ${position.poolAddress.slice(0, 8)}...
🎯 PnL: +${position.pnl.percentage.toFixed(2)}% (+$${position.pnl.unrealized.toFixed(2)})
💸 Fees Earned: $${position.feesEarned.usd.toFixed(2)}
🎉 Great job!
      `.trim(),
      data: position,
    };

    await this.queueNotification(payload);
    logger.info(`📱 Profit notification queued for position ${position.id}`);
  }

  async notifyLoss(position: Position): Promise<void> {
    const payload: NotificationPayload = {
      type: 'loss',
      title: '⚠️ Loss Warning',
      message: `
🏊 ${position.poolAddress.slice(0, 8)}...
🔴 PnL: ${position.pnl.percentage.toFixed(2)}% ($${position.pnl.unrealized.toFixed(2)})
⚠️ IL: ${position.impermanentLoss.percentage.toFixed(2)}%

Action may be needed.
      `.trim(),
      data: position,
    };

    await this.queueNotification(payload);
    logger.info(`📱 Loss notification queued for position ${position.id}`);
  }

  async notifyAIDecision(decision: AIDecision, pool: Pool): Promise<void> {
    const actionEmoji: Record<string, string> = {
      'enter': '🚀',
      'exit': '🚪',
      'rebalance': '🔄',
      'hold': '⏸️',
      'skip': '⏭️',
    };

    const payload: NotificationPayload = {
      type: 'info',
      title: '🤖 AI Decision',
      message: `
${actionEmoji[decision.action] || '🤖'} ${decision.action.toUpperCase()}
🏊 ${pool.tokenA.symbol}/${pool.tokenB.symbol}
📊 Strategy: ${decision.strategy || 'N/A'}
⭐ Confidence: ${(decision.confidence * 100).toFixed(0)}%
📈 Expected APR: ${(decision.expectedAPR * 100).toFixed(0)}%
      `.trim(),
      data: { decision, pool },
    };

    await this.queueNotification(payload);
  }

  async sendDailyReport(report: {
    date: Date;
    balance: number;
    positions: number;
    todayPnL: number;
    totalTrades: number;
  }): Promise<void> {
    const payload: NotificationPayload = {
      type: 'daily_report',
      title: '📊 Daily Report',
      message: `
📅 ${report.date.toLocaleDateString()}

💰 Balance: ${report.balance.toFixed(4)} SOL
📈 Today's PnL: $${report.todayPnL.toFixed(2)}
🏊 Active Positions: ${report.positions}
📊 Total Trades: ${report.totalTrades}
      `.trim(),
      data: report,
    };

    await this.queueNotification(payload);
    logger.info('📱 Daily report notification queued');
  }

  async sendSystemNotification(title: string, data: any): Promise<void> {
    const payload: NotificationPayload = {
      type: 'info',
      title: `🔔 ${title}`,
      message: `
${title}

${JSON.stringify(data, null, 2)}
      `.trim(),
      data,
    };

    await this.queueNotification(payload);
  }

  async sendEmergencyAlert(reason: string): Promise<void> {
    const payload: NotificationPayload = {
      type: 'emergency',
      title: '🚨 EMERGENCY ALERT',
      message: `
🚨 ${reason}

Bot status: PAUSED
All positions under review.

Please check /status for details.
      `.trim(),
      data: { reason, timestamp: new Date() },
    };

    await this.queueNotification(payload);
    logger.error('🚨 Emergency alert sent');
  }

  async sendErrorAlert(error: Error, context?: string): Promise<void> {
    const payload: NotificationPayload = {
      type: 'error',
      title: '❌ Error Alert',
      message: `
❌ An error occurred

${context ? `Context: ${context}` : ''}
Error: ${error.message}

Please check logs for details.
      `.trim(),
      data: { error: error.message, context, stack: error.stack },
    };

    await this.queueNotification(payload);
    logger.error('📱 Error alert queued');
  }

  // ==========================================
  // QUEUE OPERATIONS
  // ==========================================

  private async queueNotification(payload: NotificationPayload): Promise<void> {
    try {
      // Add to Redis queue
      await this.redis.addJob(this.queueName, {
        type: 'telegram',
        payload,
        priority: this.getPriority(payload.type),
        timestamp: new Date(),
      }, {
        priority: this.getPriority(payload.type),
        delay: 0,
      });

    } catch (error) {
      logger.error('Error queuing notification:', error);
    }
  }

  private getPriority(type: string): number {
    const priorities: Record<string, number> = {
      'emergency': 1,
      'error': 2,
      'profit': 3,
      'loss': 4,
      'entry': 5,
      'exit': 5,
      'rebalance': 6,
      'daily_report': 7,
      'info': 10,
    };

    return priorities[type] || 10;
  }

  // ==========================================
  // BATCH OPERATIONS
  // ==========================================

  async flushQueue(): Promise<void> {
    try {
      const metrics = await this.redis.getQueueMetrics(this.queueName);
      
      if (metrics.waiting > 0) {
        logger.info(`Flushing ${metrics.waiting} notifications from queue...`);
        
        // In a real implementation, this would process all pending notifications
        // For now, just log
      }

    } catch (error) {
      logger.error('Error flushing notification queue:', error);
    }
  }

  // ==========================================
  // WEBHOOK NOTIFICATIONS (for external systems)
  // ==========================================

  async sendWebhookNotification(url: string, payload: any): Promise<void> {
    try {
      // This would send HTTP POST to external webhook
      // Implementation depends on requirements
      logger.debug(`Webhook notification to ${url}:`, payload);

    } catch (error) {
      logger.error(`Error sending webhook to ${url}:`, error);
    }
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  private calculateDuration(start: Date, end?: Date): string {
    const endTime = end || new Date();
    const diff = endTime.getTime() - start.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async disconnect(): Promise<void> {
    logger.info('📱 Notification service disconnected');
  }
}

export default NotificationService;
