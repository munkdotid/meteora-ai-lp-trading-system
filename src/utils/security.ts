// ==========================================
// SECURITY UTILITIES
// Functions for sanitizing sensitive data from logs and outputs
// ==========================================

/**
 * List of sensitive keys that should never appear in logs
 */
const SENSITIVE_KEYS = [
  'privateKey',
  'secret',
  'password',
  'apiKey',
  'token',
  'authorization',
  'auth',
  'key',
  'seed',
  'mnemonic',
  'passphrase',
  'credential',
  'walletKey',
  'decryptionKey',
  'encryptionKey',
  'jwt',
  'cookie',
  'session',
  'connectionString',
  'databaseUrl',
];

/**
 * Patterns that might indicate sensitive data
 */
const SENSITIVE_PATTERNS = [
  /[a-zA-Z0-9]{88,}/, // Long base58 strings (private keys)
  /[0-9a-f]{64}/i,     // Hex strings (seeds)
  /eyJ[a-zA-Z0-9_-]*/, // JWT tokens
  /[0-9]{12,}/,        // Long numbers (API keys)
];

/**
 * Sanitize an object by redacting sensitive values
 */
export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  // Handle objects
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key is sensitive
    const isSensitiveKey = SENSITIVE_KEYS.some(sk => 
      lowerKey.includes(sk.toLowerCase())
    );

    if (isSensitiveKey) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value);
    } else if (typeof value === 'string') {
      // Check for sensitive patterns in string values
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a string by detecting and masking sensitive patterns
 */
export function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // Don't modify short strings
  if (str.length < 16) {
    return str;
  }

  // Check if string matches sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(str)) {
      // If it looks like a key/token, mask it
      if (str.length > 32) {
        return `${str.slice(0, 6)}...${str.slice(-4)}`;
      }
    }
  }

  return str;
}

/**
 * Truncate a Solana address or signature for logging
 * Shows first 4 and last 4 characters
 */
export function truncateAddress(address: string, visibleChars: number = 4): string {
  if (!address || address.length < 8) {
    return address;
  }
  
  return `${address.slice(0, visibleChars)}...${address.slice(-visibleChars)}`;
}

/**
 * Mask a URL by hiding credentials in connection strings
 */
export function maskUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  try {
    // Match patterns like: protocol://username:password@host
    const urlPattern = /^(.*:\/\/)([^:]+):([^@]+)@(.*)$/;
    const match = url.match(urlPattern);
    
    if (match) {
      return `${match[1]}${match[2]}:[REDACTED]@${match[4]}`;
    }
  } catch (e) {
    // If URL parsing fails, return masked version
    return '[REDACTED-URL]';
  }

  return url;
}

/**
 * Create a secure error message that doesn't expose sensitive info
 */
export function createSafeErrorMessage(error: Error | string): string {
  const message = error instanceof Error ? error.message : String(error);
  
  // List of sensitive keywords to check
  const sensitiveKeywords = [
    'privatekey',
    'secret',
    'password',
    'apikey',
    'token',
    'connection string',
    'database_url',
    'wallet_key',
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Check if error contains sensitive info
  if (sensitiveKeywords.some(kw => lowerMessage.includes(kw))) {
    return 'An error occurred. Check your configuration and logs for details.';
  }
  
  return message;
}

/**
 * Validate that a string doesn't contain obvious secrets
 * Useful for debugging configs
 */
export function containsSecrets(str: string): boolean {
  if (!str) return false;
  
  // Check for common secret patterns
  const patterns = [
    /[a-zA-Z0-9]{88}/, // Solana private key length
    /[0-9a-f]{128}/i,  // Very long hex (could be extended key)
    /mnemonic.*[a-z]+/i, // Mnemonic phrases
  ];
  
  return patterns.some(p => p.test(str));
}

/**
 * Secure JSON stringify that redacts sensitive values
 */
export function secureJsonStringify(obj: any, space?: number): string {
  const sanitized = sanitizeObject(obj);
  return JSON.stringify(sanitized, null, space);
}

/**
 * Hash a string for comparison without exposing the original
 * Uses simple hash for non-cryptographic purposes (logging correlation)
 */
export function simpleHash(str: string): string {
  if (!str) return '';
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Return positive hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ==========================================
// SECURITY VALIDATORS
// ==========================================

/**
 * Validate HTTPS URL
 */
export function isHttpsUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('https://');
}

/**
 * Validate IP address format
 */
export function isValidIP(ip: string): boolean {
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

/**
 * Check if value is a valid wallet address (basic check)
 */
export function isValidPublicKey(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  
  // Solana addresses are base58 and 32-44 chars
  const base58Pattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Pattern.test(address);
}

/**
 * Rate limiter class for preventing abuse
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Clean old attempts
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    
    return true;
  }

  getRemainingAttempts(key: string): number {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxAttempts - recentAttempts.length);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
