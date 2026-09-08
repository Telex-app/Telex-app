'use strict';

/**
 * Structural validation for Telegram webhook updates.
 *
 * Mirrors whatsapp/webhook.validator.js in shape and intent: reject anything
 * that could never be processed, cheaply and before it reaches code with side
 * effects, and return a `reason` so a rejection is traceable in logs rather
 * than a silent drop.
 *
 * This is deliberately structural only. Authenticity is the secret-token
 * middleware's job (middlewares/verifyTelegramSecret.js); a well-formed update
 * from an unauthenticated caller must never get this far.
 */

const invalid = (reason) => ({ valid: false, reason });
const valid = () => ({ valid: true });

/** Telegram's outermost envelope: one update, always carrying update_id. */
const validateUpdateEnvelope = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('body must be an object');
  }
  if (typeof body.update_id !== 'number' || !Number.isFinite(body.update_id)) {
    return invalid('update_id must be a finite number');
  }
  // `message` is the only update type registered via allowed_updates. Anything
  // else (edited_message, callback_query, channel_post) is well-formed but not
  // ours to handle, so it is accepted at the envelope and ignored downstream.
  return valid();
};

/**
 * A message we could actually act on. Requires an identifiable chat and sender
 * plus a timestamp, because per-sender ordering (queues/ordering.service.js)
 * keys off the provider timestamp rather than arrival order.
 */
const validateInboundMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return invalid('message must be an object');
  }
  if (!message.chat || typeof message.chat !== 'object') {
    return invalid('message.chat must be an object');
  }
  if (message.chat.id === undefined || message.chat.id === null) {
    return invalid('message.chat.id is required');
  }
  if (typeof message.message_id !== 'number') {
    return invalid('message.message_id must be a number');
  }
  if (typeof message.date !== 'number' || !Number.isFinite(message.date)) {
    return invalid('message.date must be a finite unix timestamp');
  }
  if (!message.from || typeof message.from !== 'object' || message.from.id === undefined) {
    return invalid('message.from.id is required');
  }
  // Group and channel chats are out of scope: a wallet command has to be
  // attributable to one person, and a shared chat has no single owner.
  if (message.chat.type && message.chat.type !== 'private') {
    return invalid(`unsupported chat type "${message.chat.type}"`);
  }

  const hasText = typeof message.text === 'string' && message.text.trim().length > 0;
  const hasVoice = message.voice && typeof message.voice === 'object' && typeof message.voice.file_id === 'string';
  const hasAudio = message.audio && typeof message.audio === 'object' && typeof message.audio.file_id === 'string';
  const hasContact = message.contact && typeof message.contact === 'object';

  if (!hasText && !hasVoice && !hasAudio && !hasContact) {
    return invalid('message carries no supported content (text, voice, audio or contact)');
  }

  return valid();
};

/** A contact share carries the phone number; without one it is not a link. */
const validateContact = (contact) => {
  if (!contact || typeof contact !== 'object') return invalid('contact must be an object');
  if (typeof contact.phone_number !== 'string' || !contact.phone_number.trim()) {
    return invalid('contact.phone_number is required');
  }
  return valid();
};

module.exports = {
  validateUpdateEnvelope,
  validateInboundMessage,
  validateContact,
};
