'use strict';

/**
 * Telegram Bot API client.
 *
 * Deliberately mirrors the failure-classification vocabulary of
 * services/messaging.service.js (`accepted` / `transient_failure` /
 * `permanent_failure` / `unknown`) so the shared send path in that module can
 * branch to Telegram without callers, retry policy, or the notification outbox
 * learning a second result shape.
 *
 * Two Telegram facts shape this file:
 *   - There are no delivery/read callbacks. `message_id` is an accept receipt
 *     and nothing more, so nothing here ever advances past `sent`.
 *   - There is no 24-hour customer service window and no template approval, so
 *     a proactive message never needs a pre-approved template.
 */

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const apiUrl = (method) => `${config.telegram.apiBaseUrl}/bot${config.telegram.botToken}/${method}`;

/**
 * Telegram answers 200 with `{ok: false, ...}` for application-level errors and
 * uses HTTP status only for transport-level ones, so both have to be inspected.
 * 403 is the "user blocked the bot" case: permanent, and retrying it is how you
 * get rate limited.
 */
const classifyTelegramFailure = (error) => {
  const status = Number(error?.response?.status || error?.status || 0);
  const description = String(
    error?.response?.data?.description || error?.message || 'telegram send failed',
  );

  if (status === 403) {
    return {
      outcome: 'permanent_failure',
      retryable: false,
      error: { kind: 'blocked_by_user', status, code: null, message: description },
    };
  }

  if (status === 400) {
    return {
      outcome: 'permanent_failure',
      retryable: false,
      error: { kind: 'bad_request', status, code: null, message: description },
    };
  }

  if (RETRYABLE_STATUS_CODES.has(status)) {
    return {
      outcome: 'transient_failure',
      retryable: true,
      error: { kind: status === 429 ? 'rate_limited' : 'upstream', status, code: null, message: description },
    };
  }

  if (/timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|network/i.test(description)) {
    return {
      outcome: 'transient_failure',
      retryable: true,
      error: { kind: 'network', status: status || null, code: error?.code || null, message: description },
    };
  }

  return {
    outcome: 'unknown',
    retryable: false,
    error: { kind: 'unclassified', status: status || null, code: error?.code || null, message: description },
  };
};

/**
 * The keyboard that asks for a phone number. This is the whole onboarding
 * difference from WhatsApp: Telegram will not tell us who someone is until
 * they tap this, and the number it then sends is Telegram-verified rather
 * than typed, which is what makes it safe to key a wallet on.
 */
const REQUEST_CONTACT_KEYBOARD = {
  keyboard: [[{ text: 'Share phone number', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  is_persistent: false,
};

/**
 * Low-level call. Returns a SendResult-shaped object rather than throwing, so
 * the caller in messaging.service.js can treat Meta and Telegram identically.
 */
const callApi = async (method, payload, { axiosImpl = axios, signal = null } = {}) => {
  try {
    const { outboundHeaders } = require('../observability/context');
    const response = await axiosImpl.post(apiUrl(method), payload, {
      headers: { 'Content-Type': 'application/json', ...outboundHeaders() },
      timeout: config.telegram.responseTimeoutMs,
      signal,
    });

    // ok:false on a 200 is Telegram's normal way of reporting a rejected send.
    if (response.data && response.data.ok === false) {
      const err = new Error(response.data.description || 'telegram rejected the request');
      err.response = { status: response.data.error_code || 400, data: response.data };
      throw err;
    }

    return { ok: true, result: response.data?.result };
  } catch (error) {
    return { ok: false, ...classifyTelegramFailure(error) };
  }
};

/**
 * Send a plain text message to a chat.
 *
 * @returns {Promise<{outcome: string, providerMessageId: string|null, retryable?: boolean, error?: object}>}
 */
const sendMessage = async (chatId, text, options = {}) => {
  const { axiosImpl = axios, signal = null, replyMarkup = null, parseMode = null } = options;

  const payload = {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  const response = await callApi('sendMessage', payload, { axiosImpl, signal });

  if (!response.ok) {
    return { outcome: response.outcome, retryable: response.retryable, error: response.error, providerMessageId: null };
  }

  const messageId = response.result?.message_id;
  if (messageId === undefined || messageId === null) {
    return {
      outcome: 'unknown',
      retryable: false,
      providerMessageId: null,
      error: { kind: 'malformed_response', status: 200, code: null, message: 'Telegram response did not contain a message id' },
    };
  }

  // Namespaced the same way inbound ids are, so a provider message id is
  // unambiguous across transports wherever it is stored or correlated.
  return {
    outcome: 'accepted',
    providerMessageId: `tg:${chatId}:${messageId}`,
    data: response.result,
  };
};

/** Prompt an unlinked chat to share its phone number. */
const requestContact = async (chatId, text, options = {}) =>
  sendMessage(chatId, text, { ...options, replyMarkup: REQUEST_CONTACT_KEYBOARD });

/** Dismiss the contact keyboard once a link exists, so it stops occupying the composer. */
const clearKeyboard = async (chatId, text, options = {}) =>
  sendMessage(chatId, text, { ...options, replyMarkup: { remove_keyboard: true } });

/**
 * Resolve a Telegram file_id to downloadable bytes. Two hops: getFile returns a
 * short-lived relative path, which is then fetched from the /file/ endpoint.
 * This replaces the Meta Graph media download for voice notes.
 */
const downloadFile = async (fileId, { axiosImpl = axios } = {}) => {
  const meta = await callApi('getFile', { file_id: fileId }, { axiosImpl });
  if (!meta.ok) {
    throw new Error(`telegram getFile failed: ${meta.error?.message || 'unknown error'}`);
  }

  const filePath = meta.result?.file_path;
  if (!filePath) throw new Error('telegram getFile returned no file_path');

  const url = `${config.telegram.apiBaseUrl}/file/bot${config.telegram.botToken}/${filePath}`;
  const file = await axiosImpl.get(url, {
    responseType: 'arraybuffer',
    timeout: config.telegram.responseTimeoutMs,
  });

  return {
    buffer: Buffer.from(file.data),
    mimeType: file.headers?.['content-type'] || 'audio/ogg',
    filePath,
  };
};

/**
 * Register the webhook with Telegram. `secret_token` is what later arrives as
 * the X-Telegram-Bot-Api-Secret-Token header and is verified on every POST.
 */
const setWebhook = async ({ url, secretToken, allowedUpdates = ['message'] } = {}, { axiosImpl = axios } = {}) => {
  const response = await callApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: allowedUpdates,
    // Telegram queues updates while a webhook is unset; adopting that backlog
    // on (re)registration would replay stale payment commands.
    drop_pending_updates: true,
    max_connections: 40,
  }, { axiosImpl });

  if (!response.ok) {
    logger.error('telegram_set_webhook_failed', { message: response.error?.message });
  }
  return response;
};

const getWebhookInfo = async ({ axiosImpl = axios } = {}) => callApi('getWebhookInfo', {}, { axiosImpl });

module.exports = {
  sendMessage,
  requestContact,
  clearKeyboard,
  downloadFile,
  setWebhook,
  getWebhookInfo,
  classifyTelegramFailure,
  callApi,
  REQUEST_CONTACT_KEYBOARD,
};
