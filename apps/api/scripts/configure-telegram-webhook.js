#!/usr/bin/env node
'use strict';

/**
 * Register (or inspect) the Telegram webhook.
 *
 * Telegram is pull-to-push: until setWebhook is called, updates queue on their
 * side and the bot appears dead. This is the Telegram counterpart to
 * scripts/configure-whatsapp-webhook.js.
 *
 *   node scripts/configure-telegram-webhook.js          # register
 *   node scripts/configure-telegram-webhook.js --info   # show current state
 *   node scripts/configure-telegram-webhook.js --delete # unregister
 *
 * Requires TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_CALLBACK_URL.
 */

require('dotenv').config();

const config = require('../src/config/env');
const telegram = require('../src/services/telegram.service');

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const requireConfig = () => {
  if (!config.telegram.botToken) fail('TELEGRAM_BOT_TOKEN is not set.');
};

const showInfo = async () => {
  const info = await telegram.getWebhookInfo();
  if (!info.ok) fail(info.error?.message || 'getWebhookInfo failed');

  const r = info.result || {};
  console.log('Telegram webhook status');
  console.log(`  url                  ${r.url || '(not set)'}`);
  console.log(`  pending updates      ${r.pending_update_count ?? 0}`);
  console.log(`  custom certificate   ${r.has_custom_certificate ? 'yes' : 'no'}`);
  console.log(`  max connections      ${r.max_connections ?? '-'}`);
  console.log(`  allowed updates      ${(r.allowed_updates || ['(default)']).join(', ')}`);
  if (r.last_error_message) {
    const when = r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : 'unknown time';
    console.log(`  last error           ${r.last_error_message} (${when})`);
  }
};

const registerWebhook = async () => {
  const url = config.telegram.callbackUrl;
  const secret = config.telegram.webhookSecret;

  if (!url) fail('TELEGRAM_CALLBACK_URL is not set.');
  if (!secret) fail('TELEGRAM_WEBHOOK_SECRET is not set.');
  if (!url.startsWith('https://')) fail('TELEGRAM_CALLBACK_URL must use HTTPS — Telegram refuses plaintext webhooks.');
  if (!url.endsWith('/webhook/telegram')) {
    fail(`TELEGRAM_CALLBACK_URL must end in /webhook/telegram (got "${url}").`);
  }
  // Rotation lists several secrets; only the first is the one to register.
  const activeSecret = secret.split(',')[0].trim();
  if (activeSecret.length < 32) fail('TELEGRAM_WEBHOOK_SECRET must be at least 32 characters.');

  const result = await telegram.setWebhook({ url, secretToken: activeSecret });
  if (!result.ok) fail(result.error?.message || 'setWebhook failed');

  console.log(`Webhook registered at ${url}`);
  console.log('Pending updates were dropped so queued commands are not replayed.');
  await showInfo();
};

const deleteWebhook = async () => {
  const result = await telegram.callApi('deleteWebhook', { drop_pending_updates: true });
  if (!result.ok) fail(result.error?.message || 'deleteWebhook failed');
  console.log('Webhook removed.');
};

const main = async () => {
  requireConfig();
  const args = process.argv.slice(2);

  if (args.includes('--info')) return showInfo();
  if (args.includes('--delete')) return deleteWebhook();
  return registerWebhook();
};

main().catch((error) => fail(error.message));
