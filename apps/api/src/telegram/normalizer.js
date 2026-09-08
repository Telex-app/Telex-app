'use strict';

/**
 * Translate a Telegram `Update` into the internal inbound-message shape the
 * WhatsApp webhook controller already consumes.
 *
 * This is the load-bearing idea of the Telegram transport. Rather than growing
 * a parallel inbound pipeline, an update is reshaped into the same
 * `{ contacts, messages }` value that Meta delivers, and handed to the existing
 * `processMessage`. Idempotency, per-sender throttling, message ordering, the
 * claim/release state machine and the job payload contract are therefore
 * shared, not reimplemented — and the WhatsApp tests keep covering them.
 *
 * Two mappings do real work:
 *
 *   id  Telegram's message_id is unique per chat, not globally, so it cannot be
 *       used as the dedup key on its own. It is namespaced to
 *       `tg:<chatId>:<messageId>`, which is also what the send path reports as
 *       a providerMessageId, keeping one id vocabulary across both directions.
 *
 *   from  Must be the E.164 phone number, because everything downstream
 *         (recipient resolution, pending claims, KYC, rate-limit keys) is keyed
 *         on it. The caller resolves it from TelegramLink and passes it in; an
 *         update from an unlinked chat never reaches here.
 */

/** Telegram voice notes and audio files both land on the voice pipeline. */
const mediaFrom = (message) => {
  if (message.voice?.file_id) return { kind: 'voice', fileId: message.voice.file_id };
  if (message.audio?.file_id) return { kind: 'audio', fileId: message.audio.file_id };
  return null;
};

/** Best available human name, used only for greetings and admin display. */
const displayNameFrom = (from = {}) => {
  const parts = [from.first_name, from.last_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return from.username ? `@${from.username}` : '';
};

/**
 * @param {object} message  A validated Telegram message object.
 * @param {string} phoneNumber  The canonical E.164 number linked to this chat.
 * @returns {{value: object, message: object}} Meta-shaped inbound payload.
 */
const toInboundValue = (message, phoneNumber) => {
  const chatId = String(message.chat.id);
  const id = `tg:${chatId}:${message.message_id}`;
  const media = mediaFrom(message);

  const normalized = {
    id,
    from: phoneNumber,
    // Telegram sends unix seconds, the same unit Meta uses, so the ordering
    // service needs no transport-specific handling.
    timestamp: String(message.date),
    type: media ? media.kind : 'text',
  };

  if (media) {
    normalized[media.kind] = { id: media.fileId, mime_type: message[media.kind]?.mime_type || 'audio/ogg' };
  } else {
    normalized.text = { body: message.text };
  }

  const value = {
    messaging_product: 'telegram',
    contacts: [
      {
        // The chat id occupies the slot Meta fills with a wa_id. Keeping the
        // field name means admin tooling that reads contacts[0] keeps working.
        wa_id: chatId,
        profile: { name: displayNameFrom(message.from) },
      },
    ],
    messages: [normalized],
    // Carried through so the job consumer can pick the right media download
    // and the right outbound transport without re-deriving them.
    channel: 'telegram',
    telegramChatId: chatId,
  };

  return { value, message: normalized };
};

/**
 * Classify an update before any side effects.
 *
 * @returns {{kind: 'contact'|'message'|'ignored', message?: object, contact?: object,
 *   chatId?: string, senderId?: string, username?: string, displayName?: string, reason?: string}}
 */
const classifyUpdate = (update) => {
  const message = update?.message;
  if (!message) return { kind: 'ignored', reason: 'update carries no message' };

  const chatId = message.chat?.id === undefined ? null : String(message.chat.id);
  const base = {
    chatId,
    senderId: message.from?.id === undefined ? null : String(message.from.id),
    username: message.from?.username || null,
    displayName: displayNameFrom(message.from),
    message,
  };

  // A contact share is an identity event, not a conversation turn — it must be
  // handled before the linked-chat check, since it is how a chat becomes linked.
  if (message.contact) return { ...base, kind: 'contact', contact: message.contact };

  return { ...base, kind: 'message' };
};

/**
 * `/start` (optionally with a deep-link payload) is Telegram's entry point and
 * carries no user intent worth sending to the agent — it just means "open the
 * bot". Recognising it lets the controller answer with onboarding instead of
 * feeding a meaningless command to intent parsing.
 */
const isStartCommand = (message) =>
  typeof message?.text === 'string' && /^\/start(\s|@|$)/.test(message.text.trim());

module.exports = {
  toInboundValue,
  classifyUpdate,
  displayNameFrom,
  isStartCommand,
  mediaFrom,
};
