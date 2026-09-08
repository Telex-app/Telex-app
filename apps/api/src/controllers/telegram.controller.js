'use strict';

/**
 * Transport adapter for the Telegram Bot API webhook.
 *
 * Structurally the same contract as the WhatsApp adapter: acknowledge fast, do
 * no conversation or payment work in the request path, and let a non-2xx mean
 * "redeliver this". Telegram retries an update until it gets a 2xx, so a 503
 * here is the same backpressure signal a 503 is for Meta.
 *
 * The difference is the identity gate at the top. A Telegram update arrives
 * with a chat id and no phone number, and everything downstream is keyed on a
 * phone number, so an unlinked chat is answered with the contact-share prompt
 * and nothing is enqueued. Once linked, the update is normalized into the
 * Meta-shaped payload and handed to the shared `processMessage`.
 */

const prisma = require('../common/prisma');
const config = require('../config/env');
const logger = require('../utils/logger');
const { increment } = require('../observability/metrics');
const { captureException } = require('../observability/errors');

const telegram = require('../services/telegram.service');
const linkService = require('../telegram/link.service');
const { validateUpdateEnvelope, validateInboundMessage, validateContact } = require('../telegram/webhook.validator');
const { toInboundValue, classifyUpdate, isStartCommand } = require('../telegram/normalizer');
const { processMessage, OUTCOMES } = require('./webhook.controller');

const COPY = {
  needsContact:
    'Welcome to Telex.\n\n'
    + 'Telex gives your phone number a Stellar wallet, so people can pay you '
    + 'on the number they already have for you.\n\n'
    + 'Tap the button below to share your number and get started. '
    + 'Telegram verifies it for you, so you never type it in.',
  needsContactAgain:
    'I still need your phone number before I can open your wallet. '
    + 'Tap "Share phone number" below.',
  contactNotSender:
    'That looks like someone else\'s contact card. '
    + 'Please tap "Share phone number" so Telegram sends me your own verified number.',
  contactInvalid:
    'I could not read that as a valid phone number. Tap "Share phone number" and try again.',
  contactTaken:
    'That phone number is already linked to a different Telegram account. '
    + 'If this is really your number, contact support so we can move it safely.',
  linked: (name) =>
    `Thanks${name ? `, ${name}` : ''} — your number is linked.\n\n`
    + 'You can now say things like:\n'
    + '  • balance\n'
    + '  • send 5000 to 08012345678\n'
    + '  • history\n\n'
    + 'You can also send a voice note.',
};

/**
 * Best-effort reply used for onboarding and refusals. These are conversational
 * nudges, not financial messages, so a delivery failure is logged and dropped
 * rather than being allowed to fail the webhook and trigger a redelivery.
 */
const replySafely = async (fn, context) => {
  try {
    const result = await fn();
    if (result?.outcome && result.outcome !== 'accepted') {
      logger.warn('telegram_onboarding_reply_failed', { ...context, reason: result.error?.message });
    }
  } catch (error) {
    logger.warn('telegram_onboarding_reply_threw', { ...context, message: error.message });
  }
};

/** Handle a `contact` share: the only way a chat becomes linked. */
const handleContactShare = async (classified) => {
  const { chatId, senderId, contact, username, displayName } = classified;

  const contactValidation = validateContact(contact);
  if (!contactValidation.valid) {
    increment('telex_telegram_events_total', { status: 'contact_invalid' });
    await replySafely(() => telegram.requestContact(chatId, COPY.contactInvalid), { chatId });
    return { outcome: 'contact_invalid' };
  }

  const result = await linkService.linkContact(
    { chatId, contact, senderId, username, displayName },
    prisma,
  );

  if (!result.ok) {
    increment('telex_telegram_events_total', { status: `contact_${result.reason}` });
    const message = result.reason === 'phone_linked_to_other_chat'
      ? COPY.contactTaken
      : (result.reason === 'invalid_phone' ? COPY.contactInvalid : COPY.contactNotSender);
    await replySafely(() => telegram.requestContact(chatId, message), { chatId, reason: result.reason });
    return { outcome: `contact_${result.reason}` };
  }

  increment('telex_telegram_events_total', { status: 'linked' });
  // clearKeyboard rather than sendMessage so the contact button stops occupying
  // the composer now that it has served its purpose.
  await replySafely(
    () => telegram.clearKeyboard(chatId, COPY.linked(displayName)),
    { chatId },
  );
  return { outcome: 'linked', phoneNumber: result.link.phoneNumber };
};

/**
 * Process one update. Returns an outcome so the request handler can decide
 * whether to acknowledge, without any single item's failure discarding others.
 */
const processUpdate = async (update) => {
  const classified = classifyUpdate(update);

  if (classified.kind === 'ignored') {
    increment('telex_telegram_events_total', { status: 'ignored' });
    return { outcome: 'ignored' };
  }

  const messageValidation = validateInboundMessage(classified.message);
  if (!messageValidation.valid) {
    logger.warn('telegram_webhook_invalid_message', { reason: messageValidation.reason });
    increment('telex_telegram_events_total', { status: 'invalid_schema' });
    return { outcome: 'invalid' };
  }

  if (classified.kind === 'contact') {
    return handleContactShare(classified);
  }

  const phoneNumber = await linkService.phoneForChatId(classified.chatId, prisma);

  if (!phoneNumber) {
    // Unlinked chat. Prompt for the contact share and stop — nothing is
    // enqueued, because there is no identity to attribute the command to.
    increment('telex_telegram_events_total', { status: 'unlinked' });
    const copy = isStartCommand(classified.message) ? COPY.needsContact : COPY.needsContactAgain;
    await replySafely(() => telegram.requestContact(classified.chatId, copy), { chatId: classified.chatId });
    return { outcome: 'needs_contact' };
  }

  // `/start` from an already-linked chat is a no-op greeting, not a command.
  if (isStartCommand(classified.message)) {
    increment('telex_telegram_events_total', { status: 'start' });
    await replySafely(
      () => telegram.clearKeyboard(classified.chatId, COPY.linked(classified.displayName)),
      { chatId: classified.chatId },
    );
    return { outcome: 'start' };
  }

  const { value } = toInboundValue(classified.message, phoneNumber);
  const [normalizedMessage] = value.messages;

  const result = await processMessage({ message: normalizedMessage, value });
  increment('telex_telegram_events_total', { status: result.outcome });
  return result;
};

const handleIncomingUpdate = async (req, res) => {
  increment('telex_telegram_events_total', { status: 'received' });

  try {
    const envelopeValidation = validateUpdateEnvelope(req.body);
    if (!envelopeValidation.valid) {
      logger.warn('telegram_webhook_invalid_envelope', { reason: envelopeValidation.reason });
      increment('telex_telegram_events_total', { status: 'invalid_schema' });
      // 200: a malformed envelope will never become valid, so asking Telegram
      // to redeliver it would loop forever.
      return res.status(200).send('EVENT_RECEIVED');
    }

    const result = await processUpdate(req.body);

    // Only genuinely retryable states refuse acknowledgement. Telegram
    // redelivers the update, and the shared claim table makes the retry
    // idempotent for anything already enqueued.
    if (result.outcome === OUTCOMES.FAILED || result.outcome === OUTCOMES.CLAIMING_CONFLICT) {
      if (!res.headersSent) return res.status(503).send('QUEUE_UNAVAILABLE');
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    increment('telex_telegram_events_total', { status: 'failed' });
    logger.error('telegram_webhook_processing_error', { message: error.message });
    captureException(error, { source: 'telegram_webhook' });
    if (!res.headersSent) return res.status(503).send('QUEUE_UNAVAILABLE');
  }
};

/**
 * Liveness probe for the Telegram webhook. Mirrors the GET verification
 * endpoint the Meta webhook exposes so deployment checks have a symmetric
 * target, though Telegram itself never calls it.
 */
const webhookHealth = async (_req, res) => {
  const configured = Boolean(config.telegram?.botToken && config.telegram?.webhookSecret);
  return res.status(200).json({
    transport: config.messageTransport,
    telegramConfigured: configured,
  });
};

module.exports = {
  handleIncomingUpdate,
  processUpdate,
  webhookHealth,
  COPY,
};
