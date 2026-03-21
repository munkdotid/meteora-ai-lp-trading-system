// ==========================================
// REDIS SERVICE
// Cache, queue, and pub/sub functionality
// ==========================================

import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

export class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected: boolean = false;
  private queues: Map<string, Queue> = new Map();

  constructor() {
    // Will be initialized in connect()
  }

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  async connect(): Promise<void> {
    try {
      logger.info('🔗 Connecting to Redis...');

      // Create main client
      this.client = new Redis(config.redis.url, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      // Create subscriber client (for pub/sub)
      this.subscriber = new Redis(config.redis.url, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });

      // Handle events
      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        logger.error('Redis error:', error);
        this.isConnected = false;
      });

      // Test connection
      await this.client.ping();

      logger.info('✅ Redis service initialized');

    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Close all queues
      for (const [name, queue] of this.queues) {
        await queue.close();
        logger.info(`Queue ${name} closed`);
      }
      this.queues.clear();

      // Close clients
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }

      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }

      this.isConnected = false;
      logger.info('👋 Redis disconnected');

    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  // ==========================================
  // BASIC CACHE OPERATIONS
  // ==========================================

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.ttl(key);
  }

  // ==========================================
  // HASH OPERATIONS
  // ==========================================

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.hdel(key, field);
  }

  // ==========================================
  // LIST OPERATIONS
  // ==========================================

  async lpush(key: string, value: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.lpush(key, value);
  }

  async rpush(key: string, value: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.rpush(key, value);
  }

  async lpop(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.lpop(key);
  }

  async rpop(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.rpop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.ltrim(key, start, stop);
  }

  // ==========================================
  // SET OPERATIONS
  // ==========================================

  async sadd(key: string, member: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.srem(key, member);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.smembers(key);
  }

  // ==========================================
  // SORTED SET OPERATIONS
  // ==========================================

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.zadd(key, score, member);
  }

  async zrem(key: string, member: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.zrem(key, member);
  }

  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    if (withScores) {
      return this.client.zrange(key, start, stop, 'WITHSCORES');
    }
    return this.client.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    if (withScores) {
      return this.client.zrevrange(key, start, stop, 'WITHSCORES');
    }
    return this.client.zrevrange(key, start, stop);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.zscore(key, member);
  }

  // ==========================================
  // PUB/SUB
  // ==========================================

  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string, channel: string) => void): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not connected');

    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(message, receivedChannel);
      }
    });

    logger.info(`Subscribed to channel: ${channel}`);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) throw new Error('Redis subscriber not connected');
    await this.subscriber.unsubscribe(channel);
    logger.info(`Unsubscribed from channel: ${channel}`);
  }

  // ==========================================
  // QUEUE OPERATIONS (BullMQ)
  // ==========================================

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: this.client!,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      this.queues.set(name, queue);
      logger.info(`Queue ${name} created`);
    }

    return this.queues.get(name)!;
  }

  async addJob(queueName: string, data: any, options?: any): Promise<Job> {
    const queue = this.getQueue(queueName);
    return queue.add(queueName, data, options);
  }

  async getJob(queueName: string, id: string): Promise<Job | undefined> {
    const queue = this.getQueue(queueName);
    return queue.getJob(id);
  }

  async removeJob(queueName: string, id: string): Promise<void> {
    const job = await this.getJob(queueName, id);
    if (job) {
      await job.remove();
    }
  }

  async getQueueMetrics(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = this.getQueue(queueName);
    return queue.getJobCounts();
  }

  createWorker(queueName: string, processor: (job: Job) => Promise<any>): Worker {
    const worker = new Worker(queueName, processor, {
      connection: this.client!,
      concurrency: 5,
    });

    worker.on('completed', (job) => {
      logger.info(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed:`, err);
    });

    logger.info(`Worker for queue ${queueName} created`);
    return worker;
  }

  // ==========================================
  // RATE LIMITING
  // ==========================================

  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    if (!this.client) throw new Error('Redis not connected');

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    // Remove old entries
    await this.client.zremrangebyscore(key, 0, windowStart);

    // Count current entries
    const currentCount = await this.client.zcard(key);

    if (currentCount >= limit) {
      // Get the oldest entry to calculate reset time
      const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = parseInt(oldest[1]);
      const resetTime = oldestTimestamp + windowSeconds;

      return {
        allowed: false,
        remaining: 0,
        resetTime,
      };
    }

    // Add current request
    await this.client.zadd(key, now, `${now}-${Math.random()}`);
    await this.client.expire(key, windowSeconds);

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      resetTime: now + windowSeconds,
    };
  }

  // ==========================================
  // LOCKING (Distributed locks)
  // ==========================================

  async acquireLock(lockKey: string, ttlSeconds: number = 30): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');

    const token = `${Date.now()}-${Math.random()}`;
    const result = await this.client.set(lockKey, token, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      return token;
    }

    return null;
  }

  async releaseLock(lockKey: string, token: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');

    // Use Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.client.eval(script, 1, lockKey, token);
    return result === 1;
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  async setSession(sessionId: string, data: Record<string, any>, ttlSeconds: number = 3600): Promise<void> {
    const key = `session:${sessionId}`;
    const value = JSON.stringify(data);
    await this.set(key, value, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<Record<string, any> | null> {
    const key = `session:${sessionId}`;
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  // ==========================================
  // CACHE PATTERNS
  // ==========================================

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Generate value
    const value = await factory();

    // Store in cache
    await this.set(key, JSON.stringify(value), ttlSeconds);

    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    // Get keys matching pattern
    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    // Delete keys
    if (keys.length > 0) {
      await this.client.del(...keys);
      logger.info(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
    }
  }

  // ==========================================
  // PIPELINING (Batch operations)
  // ==========================================

  pipeline(): Redis.Pipeline {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.pipeline();
  }

  async execPipeline(pipeline: Redis.Pipeline): Promise<any[]> {
    return pipeline.exec();
  }

  // ==========================================
  // TRANSACTIONS (Multi/Exec)
  // ==========================================

  multi(): Redis.Multi {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.multi();
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async ping(): Promise<string> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.ping();
  }

  async info(): Promise<string> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.info();
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return this.client.keys(pattern);
  }

  async flushdb(): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.flushdb();
    logger.warn('Redis database flushed');
  }

  // ==========================================
  // RAW CLIENT ACCESS
  // ==========================================

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not connected');
    return this.client;
  }
}

export default RedisService;
