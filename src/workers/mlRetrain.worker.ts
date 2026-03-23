/**
 * mlRetrain.worker.ts
 * BRD v3 §3.2 — BullMQ worker for automated ML model retraining.
 *
 * "Training Pipeline: Automated via BullMQ scheduled jobs.
 *  Raw data → feature engineering → train/validation split (80/20)
 *  → model evaluation → shadow deployment (7-day parallel run)
 *  → production promotion if metrics pass gate."
 *
 * Job types:
 *   retrain:volume_predictor       — weekly
 *   retrain:price_trend_classifier — bi-weekly
 *   retrain:volatility_forecaster  — daily
 *   retrain:strategy_selector      — monthly
 *   export_training_data           — daily, prepares JSON snapshot files
 *   shadow:evaluate                — triggered manually or on schedule
 */

import { Worker, Queue, QueueScheduler, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';
import { MLPipelineService } from '../services/MLPipelineService';
import type { ModelName } from '../services/MLPipelineService';

// ─── Redis connection ─────────────────────────────────────────────────────────

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
});

// ─── Queue names ──────────────────────────────────────────────────────────────

export const ML_QUEUE_NAME = 'ml-pipeline';

// ─── Job payloads ─────────────────────────────────────────────────────────────

export interface RetrainJobData {
  modelName: ModelName;
  triggeredBy: 'schedule' | 'manual' | 'rollback';
}

export interface ExportDataJobData {
  outputDir: string;
  days: number;
}

export interface ShadowEvaluateJobData {
  modelName: ModelName;
}

// ─── Queue + Scheduler ────────────────────────────────────────────────────────

export function createMLQueue() {
  return new Queue<RetrainJobData | ExportDataJobData | ShadowEvaluateJobData>(
    ML_QUEUE_NAME,
    { connection: redis }
  );
}

export function createMLQueueScheduler() {
  return new QueueScheduler(ML_QUEUE_NAME, { connection: redis });
}

// ─── Register repeatable jobs (BRD §3.2 schedule) ─────────────────────────────

export async function registerMLScheduledJobs(queue: Queue): Promise<void> {
  // Remove old repeatable jobs first (clean slate on restart)
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  const jobs: Array<{ name: string; data: RetrainJobData; pattern: string; desc: string }> = [
    {
      name: 'retrain:volatility_forecaster',
      data: { modelName: 'volatility_forecaster', triggeredBy: 'schedule' },
      pattern: '0 2 * * *',       // daily at 02:00 UTC
      desc: 'Daily volatility model retrain',
    },
    {
      name: 'retrain:volume_predictor',
      data: { modelName: 'volume_predictor', triggeredBy: 'schedule' },
      pattern: '0 3 * * 1',       // weekly Monday 03:00 UTC
      desc: 'Weekly volume predictor retrain',
    },
    {
      name: 'retrain:price_trend_classifier',
      data: { modelName: 'price_trend_classifier', triggeredBy: 'schedule' },
      pattern: '0 3 1,15 * *',    // bi-weekly (1st and 15th) 03:00 UTC
      desc: 'Bi-weekly price trend retrain',
    },
    {
      name: 'retrain:strategy_selector',
      data: { modelName: 'strategy_selector', triggeredBy: 'schedule' },
      pattern: '0 4 1 * *',       // monthly 1st 04:00 UTC
      desc: 'Monthly strategy selector retrain',
    },
    {
      name: 'export_training_data',
      data: { outputDir: '/data/pool_snapshots', days: 90 } as ExportDataJobData,
      pattern: '0 1 * * *',       // daily at 01:00 UTC (before retrain jobs)
      desc: 'Daily training data export',
    } as any,
  ];

  for (const job of jobs) {
    await queue.add(job.name, job.data, {
      repeat: { pattern: job.pattern },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
    logger.info(`[MLWorker] Scheduled: ${job.name} (${job.desc})`);
  }

  logger.info(`[MLWorker] Registered ${jobs.length} scheduled ML jobs`);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createMLWorker(mlPipeline: MLPipelineService, deps: {
  exportTrainingData: (outputDir: string, days: number) => Promise<void>;
  onAlert: (msg: string) => Promise<void>;
}): Worker {
  const worker = new Worker<RetrainJobData | ExportDataJobData | ShadowEvaluateJobData>(
    ML_QUEUE_NAME,
    async (job: Job) => {
      logger.info(`[MLWorker] Processing job: ${job.name} (id: ${job.id})`);

      // ── Export training data ────────────────────────────────────────────────
      if (job.name === 'export_training_data') {
        const data = job.data as ExportDataJobData;
        logger.info(`[MLWorker] Exporting training data: ${data.days} days → ${data.outputDir}`);
        await deps.exportTrainingData(data.outputDir, data.days);
        logger.info(`[MLWorker] Training data export complete`);
        return;
      }

      // ── Shadow evaluation (manual trigger) ─────────────────────────────────
      if (job.name === 'shadow:evaluate') {
        const data = job.data as ShadowEvaluateJobData;
        logger.info(`[MLWorker] Manual shadow evaluation: ${data.modelName}`);
        const status = mlPipeline.getShadowStatus();
        if (!status[data.modelName]) {
          logger.warn(`[MLWorker] No active shadow run for ${data.modelName}`);
          return;
        }
        // Force evaluate via pipeline (delegates to ShadowDeploymentService)
        await mlPipeline.triggerRetrain(data.modelName);
        return;
      }

      // ── Model retrain ───────────────────────────────────────────────────────
      if (job.name.startsWith('retrain:')) {
        const data = job.data as RetrainJobData;
        const { modelName, triggeredBy } = data;

        logger.info(`[MLWorker] Retraining ${modelName} (triggered by: ${triggeredBy})`);
        await deps.onAlert(`🔄 ML retrain started: ${modelName} (${triggeredBy})`);

        await job.updateProgress(10);

        try {
          await mlPipeline.triggerRetrain(modelName);
          await job.updateProgress(100);
          logger.info(`[MLWorker] Retrain complete: ${modelName}`);
        } catch (err) {
          logger.error(`[MLWorker] Retrain failed: ${modelName}`, err);
          await deps.onAlert(`❌ ML retrain failed: ${modelName} — ${(err as Error).message}`);
          throw err; // BullMQ will retry
        }
        return;
      }

      logger.warn(`[MLWorker] Unknown job: ${job.name}`);
    },
    {
      connection: redis,
      concurrency: 1,             // train one model at a time (GPU/CPU constraint)
      limiter: { max: 2, duration: 3_600_000 }, // max 2 jobs per hour
    }
  );

  worker.on('completed', job => {
    logger.info(`[MLWorker] Job completed: ${job.name} (${job.id})`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[MLWorker] Job failed: ${job?.name} (${job?.id}): ${err.message}`);
  });

  worker.on('stalled', jobId => {
    logger.warn(`[MLWorker] Job stalled: ${jobId}`);
  });

  return worker;
}

// ─── Manual trigger helpers (Telegram /retrain command) ──────────────────────

export async function triggerRetrainNow(
  queue: Queue,
  modelName: ModelName
): Promise<string> {
  const job = await queue.add(
    `retrain:${modelName}`,
    { modelName, triggeredBy: 'manual' } as RetrainJobData,
    { priority: 1, removeOnComplete: 5 }
  );
  logger.info(`[MLWorker] Manual retrain enqueued: ${modelName} (job: ${job.id})`);
  return job.id ?? 'unknown';
}

export async function getMLQueueStatus(queue: Queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}
