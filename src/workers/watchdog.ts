/**
 * watchdog.ts
 * BRD v3 §11.2 — Dead Man's Switch watchdog process.
 * Runs as a SEPARATE container (docker-compose service: watchdog).
 * Monitors Redis heartbeat key. If TTL expires (> 90s no heartbeat),
 * fires P0 alert via Telegram + SMS indicating potential system crash.
 *
 * This process is intentionally minimal and has no dependencies on the
 * main app — it must stay alive even when the main app crashes.
 */

import { createClient } from 'redis';
import https from 'https';

// ─── Configuration ────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const HEARTBEAT_KEY = 'system:heartbeat';
const CHECK_INTERVAL_MS = 15_000;   // check every 15s
const EXPECTED_TTL_SECS = 90;       // heartbeat should refresh every 60s; alert after 90s
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_AUTHORIZED_USERS ?? '').split(',').filter(Boolean);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
const TWILIO_FROM = process.env.TWILIO_PHONE_FROM ?? '';
const TWILIO_TO = process.env.TWILIO_PHONE_TO ?? '';

// ─── State ────────────────────────────────────────────────────────────────────

let alertSent = false;
let consecutiveMisses = 0;
const startTime = new Date();

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[Watchdog] Started at ${startTime.toISOString()}`);
  console.log(`[Watchdog] Monitoring Redis key: ${HEARTBEAT_KEY} (TTL threshold: ${EXPECTED_TTL_SECS}s)`);

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => console.error('[Watchdog] Redis error:', err));
  await redis.connect();

  setInterval(async () => {
    try {
      const ttl = await redis.ttl(HEARTBEAT_KEY);

      if (ttl === -2) {
        // Key does not exist (expired or never set)
        consecutiveMisses++;
        console.warn(`[Watchdog] Heartbeat key missing. Consecutive misses: ${consecutiveMisses}`);

        if (consecutiveMisses >= 2 && !alertSent) {
          console.error('[Watchdog] DEAD MAN\'S SWITCH TRIGGERED — firing P0 alert');
          await fireP0Alert();
          alertSent = true;
        }
      } else if (ttl > 0) {
        // Heartbeat is alive
        consecutiveMisses = 0;
        if (alertSent) {
          console.info('[Watchdog] Heartbeat restored — system recovered');
          await fireTelegram('✅ *System Recovered*\n\nHeartbeat restored. System appears to be back online.');
          alertSent = false;
        }
        console.log(`[Watchdog] Heartbeat OK. TTL: ${ttl}s`);
      }
    } catch (err) {
      console.error('[Watchdog] Check failed:', err);
    }
  }, CHECK_INTERVAL_MS);
}

// ─── Alert Functions ──────────────────────────────────────────────────────────

async function fireP0Alert(): Promise<void> {
  const uptime = Math.round((Date.now() - startTime.getTime()) / 1000);
  const message =
    `🚨 *[P0 CRITICAL] Dead Man's Switch Triggered*\n\n` +
    `The main trading system has NOT published a heartbeat for > ${EXPECTED_TTL_SECS} seconds.\n\n` +
    `⚠️ Possible system crash or freeze.\n` +
    `📡 Watchdog uptime: ${uptime}s\n` +
    `🕐 Triggered at: ${new Date().toISOString()}\n\n` +
    `*Immediate action required: check server and positions.*`;

  await fireTelegram(message);
  await fireSms(`[P0 CRITICAL] AI LP Trading System heartbeat lost. Possible crash. Check server immediately. ${new Date().toISOString()}`);
}

async function fireTelegram(message: string): Promise<void> {
  for (const chatId of TELEGRAM_CHAT_IDS) {
    const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
    await httpPost(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      body,
      { 'Content-Type': 'application/json' }
    );
    console.log(`[Watchdog] Telegram sent to ${chatId}`);
  }
}

async function fireSms(message: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !TWILIO_TO) {
    console.warn('[Watchdog] Twilio not configured — SMS skipped');
    return;
  }

  const body = new URLSearchParams({ To: TWILIO_TO, From: TWILIO_FROM, Body: message }).toString();
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

  await httpPost(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    body,
    { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` }
  );
  console.log(`[Watchdog] SMS sent to ${TWILIO_TO}`);
}

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('[Watchdog] Fatal error:', err);
  process.exit(1);
});
