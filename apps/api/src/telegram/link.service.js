'use strict';

/**
 * Telegram <-> phone number identity bridge.
 *
 * Telex keys everything (wallet, recipient resolution, pending claims, KYC)
 * on an E.164 phone number. Telegram keys everything on a numeric `chat_id`
 * and never volunteers a phone number. This module is the single translation
 * point between the two, so the rest of the codebase keeps addressing people
 * by phone number exactly as it does on WhatsApp.
 *
 * Trust model: a link is only ever written from a Telegram `contact` object
 * that Telegram itself populated in response to a `request_contact` keyboard
 * button, and only when `contact.user_id` matches the sender. A user can
 * forward someone else's contact card through the same field — accepting that
 * would let them address the victim's wallet, so it is rejected.
 */

const prismaDefault = require('../common/prisma');
const logger = require('../utils/logger');
const { canonicalizePhoneNumber } = require('../utils/validators');

/** Resolve a Telegram chat id to the phone number Telex knows the user by. */
const phoneForChatId = async (chatId, prisma = prismaDefault) => {
  if (chatId === null || chatId === undefined) return null;
  const link = await prisma.telegramLink.findUnique({ where: { chatId: String(chatId) } });
  return link?.phoneNumber || null;
};

/**
 * Reverse direction: every outbound caller in the codebase passes a phone
 * number, so the send path needs this to find the chat to deliver into.
 */
const chatIdForPhone = async (phoneNumber, prisma = prismaDefault) => {
  if (!phoneNumber) return null;
  let canonical;
  try {
    canonical = canonicalizePhoneNumber(phoneNumber);
  } catch (_err) {
    return null;
  }
  const link = await prisma.telegramLink.findUnique({ where: { phoneNumber: canonical } });
  return link?.chatId || null;
};

/** Full link record for a chat, when the caller needs the profile fields too. */
const linkForChatId = async (chatId, prisma = prismaDefault) => {
  if (chatId === null || chatId === undefined) return null;
  return prisma.telegramLink.findUnique({ where: { chatId: String(chatId) } });
};

/**
 * Persist a Telegram-verified contact share.
 *
 * Re-shares are idempotent and refresh the profile fields. A chat that shares
 * a *different* number than it previously linked is treated as the user moving
 * their account: the chat id is the stable anchor, so the phone number is
 * updated. The inverse (a number arriving from a second chat) is rejected,
 * because two Telegram accounts pointing at one wallet is an account-takeover
 * shape, not a legitimate migration.
 *
 * @returns {Promise<{ok: true, link: object} | {ok: false, reason: string}>}
 */
const linkContact = async ({ chatId, contact, senderId, username, displayName }, prisma = prismaDefault) => {
  if (!contact || typeof contact !== 'object') {
    return { ok: false, reason: 'missing_contact' };
  }

  // Telegram sets `user_id` on a shared contact only when the contact is a
  // Telegram user. Requiring it to equal the sender is what makes this a
  // self-attestation rather than "here is a number I know".
  if (contact.user_id === undefined || contact.user_id === null) {
    return { ok: false, reason: 'contact_not_telegram_user' };
  }
  if (String(contact.user_id) !== String(senderId)) {
    return { ok: false, reason: 'contact_not_sender' };
  }

  let phoneNumber;
  try {
    phoneNumber = canonicalizePhoneNumber(String(contact.phone_number || ''));
  } catch (_err) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const chat = String(chatId);

  const existingForPhone = await prisma.telegramLink.findUnique({ where: { phoneNumber } });
  if (existingForPhone && existingForPhone.chatId !== chat) {
    logger.warn('telegram_link_phone_owned_by_other_chat', {
      phoneNumber,
      existingChatId: existingForPhone.chatId,
      attemptedChatId: chat,
    });
    return { ok: false, reason: 'phone_linked_to_other_chat' };
  }

  const link = await prisma.telegramLink.upsert({
    where: { chatId: chat },
    create: {
      chatId: chat,
      phoneNumber,
      username: username || null,
      displayName: displayName || null,
    },
    update: {
      phoneNumber,
      username: username || null,
      displayName: displayName || null,
      verifiedAt: new Date(),
    },
  });

  logger.info('telegram_link_established', { chatId: chat, phoneNumber });
  return { ok: true, link };
};

/**
 * Remove a link. Called from the erasure path so a Telegram user's identity
 * bridge disappears with the rest of their data.
 */
const unlinkPhone = async (phoneNumber, prisma = prismaDefault) => {
  if (!phoneNumber) return 0;
  const { count } = await prisma.telegramLink.deleteMany({ where: { phoneNumber } });
  return count;
};

module.exports = {
  phoneForChatId,
  chatIdForPhone,
  linkForChatId,
  linkContact,
  unlinkPhone,
};
