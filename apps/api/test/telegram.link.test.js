const { test } = require('node:test');
const assert = require('node:assert/strict');

const linkService = require('../src/telegram/link.service');

/**
 * Minimal stand-in for prisma.telegramLink. Keyed twice because the real model
 * has unique indexes on both chatId and phoneNumber, and the takeover guard
 * depends on the phone-number lookup actually finding a foreign row.
 */
const stubPrisma = (rows = []) => {
  const store = [...rows];
  return {
    store,
    telegramLink: {
      findUnique: async ({ where }) => {
        if (where.chatId !== undefined) return store.find((r) => r.chatId === where.chatId) || null;
        if (where.phoneNumber !== undefined) return store.find((r) => r.phoneNumber === where.phoneNumber) || null;
        return null;
      },
      upsert: async ({ where, create, update }) => {
        const existing = store.find((r) => r.chatId === where.chatId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `tl_${store.length + 1}`, ...create };
        store.push(row);
        return row;
      },
      deleteMany: async ({ where }) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i -= 1) {
          if (store[i].phoneNumber === where.phoneNumber) store.splice(i, 1);
        }
        return { count: before - store.length };
      },
    },
  };
};

const contact = (overrides = {}) => ({
  phone_number: '2348012345678',
  first_name: 'Ada',
  user_id: 987654321,
  ...overrides,
});

test('links a self-shared contact and canonicalizes the number to E.164', () => {
  const prisma = stubPrisma();
  return linkService
    .linkContact({ chatId: 987654321, contact: contact(), senderId: 987654321, username: 'adaobi' }, prisma)
    .then((result) => {
      assert.equal(result.ok, true);
      // Telegram sends the number without a leading +; storing it raw would
      // fail every downstream lookup, which all use E.164.
      assert.equal(result.link.phoneNumber, '+2348012345678');
      assert.equal(result.link.chatId, '987654321');
    });
});

test('rejects a forwarded contact card belonging to someone else', async () => {
  // Anyone can forward a third party's contact through the same field. Trusting
  // it would let an attacker bind their chat to the victim's wallet.
  const prisma = stubPrisma();
  const result = await linkService.linkContact(
    { chatId: 987654321, contact: contact({ user_id: 555000111 }), senderId: 987654321 },
    prisma,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'contact_not_sender');
  assert.equal(prisma.store.length, 0);
});

test('rejects a contact that is not a Telegram user at all', async () => {
  // A manually typed contact has no user_id, so it carries no verification.
  const prisma = stubPrisma();
  const result = await linkService.linkContact(
    { chatId: 987654321, contact: contact({ user_id: undefined }), senderId: 987654321 },
    prisma,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'contact_not_telegram_user');
});

test('rejects a phone number already linked to a different chat', async () => {
  const prisma = stubPrisma([
    { id: 'tl_1', chatId: '111111111', phoneNumber: '+2348012345678' },
  ]);

  const result = await linkService.linkContact(
    { chatId: 987654321, contact: contact(), senderId: 987654321 },
    prisma,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'phone_linked_to_other_chat');
  assert.equal(prisma.store.length, 1);
  assert.equal(prisma.store[0].chatId, '111111111');
});

test('re-sharing from the same chat is idempotent and refreshes the profile', async () => {
  const prisma = stubPrisma();
  await linkService.linkContact(
    { chatId: 987654321, contact: contact(), senderId: 987654321, username: 'old' },
    prisma,
  );
  const second = await linkService.linkContact(
    { chatId: 987654321, contact: contact(), senderId: 987654321, username: 'new' },
    prisma,
  );

  assert.equal(second.ok, true);
  assert.equal(prisma.store.length, 1);
  assert.equal(prisma.store[0].username, 'new');
});

test('rejects an unparseable phone number', async () => {
  const prisma = stubPrisma();
  const result = await linkService.linkContact(
    { chatId: 987654321, contact: contact({ phone_number: 'not-a-number' }), senderId: 987654321 },
    prisma,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_phone');
});

test('resolves a chat id to a phone number and back', async () => {
  const prisma = stubPrisma([
    { id: 'tl_1', chatId: '987654321', phoneNumber: '+2348012345678' },
  ]);

  assert.equal(await linkService.phoneForChatId(987654321, prisma), '+2348012345678');
  assert.equal(await linkService.chatIdForPhone('+2348012345678', prisma), '987654321');
  // Callers pass numbers in whatever shape they hold; the reverse lookup has to
  // canonicalize before matching or outbound sends to a valid user would fail.
  assert.equal(await linkService.chatIdForPhone('08012345678', prisma), '987654321');
});

test('returns null rather than throwing for unknown or malformed lookups', async () => {
  const prisma = stubPrisma();
  assert.equal(await linkService.phoneForChatId(null, prisma), null);
  assert.equal(await linkService.chatIdForPhone(null, prisma), null);
  assert.equal(await linkService.chatIdForPhone('garbage', prisma), null);
});

test('unlinking removes the bridge for a phone number', async () => {
  const prisma = stubPrisma([
    { id: 'tl_1', chatId: '987654321', phoneNumber: '+2348012345678' },
  ]);

  assert.equal(await linkService.unlinkPhone('+2348012345678', prisma), 1);
  assert.equal(prisma.store.length, 0);
});
