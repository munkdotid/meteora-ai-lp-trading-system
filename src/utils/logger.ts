// ==========================================
// LOGGER UTILITY
// Winston-based logging with rotation
// ==========================================

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
import { sanitizeObject, sanitizeString } from './security';

// Custom format with sanitization
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      // Sanitize metadata to prevent sensitive data leakage
      const sanitizedMetadata = sanitizeObject(metadata);
      msg += ` ${JSON.stringify(sanitizedMetadata)}`;
    }
    
    if (stack) {
      // Sanitize stack traces too
      const sanitizedStack = sanitizeString(stack);
      msg += `\n${sanitizedStack}`;
    }
    
    return msg;
  })
);

// Console format (colorized for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Create logger
export const logger = winston.createLogger({
  level: config.logLevel,
  defaultMeta: { service: 'meteora-ai-lp' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: config.isDevelopment ? consoleFormat : customFormat,
    }),
    
    // File output with rotation
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat,
    }),
    
    // Separate error log
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: customFormat,
    }),
    
    // Trade execution log
    new DailyRotateFile({
      filename: 'logs/trades-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d',
      format: customFormat,
    }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
});

// Trade-specific logger
export const tradeLogger = winston.createLogger({
  level: 'info',
  defaultMeta: { service: 'meteora-trades' },
  transports: [
    new DailyRotateFile({
      filename: 'logs/trades-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '90d',
      format: customFormat,
    }),
  ],
});

// AI decision logger
export const aiLogger = winston.createLogger({
  level: 'info',
  defaultMeta: { service: 'meteora-ai' },
  transports: [
    new DailyRotateFile({
      filename: 'logs/ai-decisions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      format: customFormat,
    }),
  ],
});

export default logger;
