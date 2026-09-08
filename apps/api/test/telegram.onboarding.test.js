const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ---------------------------------------------------------------------------
// Env must be set before any src module is loaded.
// ---------------------------------------------------------------------------
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'b'.repeat(64);
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.NODE_ENV = 'development';
process.env.PIN_PEPPER = 'test-pepper';
process.env.MESSAGE_TRANSPORT = 'telegram';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

// Same module-level injection the WhatsApp webhook integration test uses.
const injectMock = (relativeFromSrc, exports) => {
  const abs = path.resolve(__dirname, '../src', `${relativeFromSrc}.js`);
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
};

// --- Telegram identity bridge, in memory ----------------------------------
const links = new Map(); // chatId -> row

const prismaMock = {
  telegramLink: {
    findUnique: async ({ where }) => {
      if (where.chatId !== undefined) return links.get(String(where.chatId)) || null;
      if (where.phoneNumber !== undefined) {
        for (const row of links.values()) if (row.phoneNumber === where.phoneNumber) return row;
        return null;
      }
      return null;
    },
    upsert: async ({ where, create, update }) => {
      const existing = links.get(String(where.chatId));
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: `tl_${links.size + 1}`, ...create };
      links.set(String(where.chatId), row);
      return row;
    },
  },
};

// --- Outbound Telegram calls, recorded rather than sent --------------------
const sent = [];
const telegramMock = {
  sendMessage: async (chatId, text, options = {}) => {
    sent.push({ method: 'sendMessage', chatId: String(chatId), text, options });
    return { outcome: 'accepted', providerMessageId: `tg:${chatId}:1` };
  },
  requestContact: async (chatId, text) => {
    sent.push({ method: 'requestContact', chatId: String(chatId), text });
    return { outcome: 'accepted', providerMessageId: `tg:${chatId}:1` };
  },
  clearKeyboard: async (chatId, text) => {
    sent.push({ method: 'clearKeyboard', chatId: String(chatId), text });
    return { outcome: 'accepted', providerMessageId: `tg:${chatId}:1` };
  },
};

// --- The shared pipeline: record what would have been enqueued -------------
const processed = [];
// Mutable so a test can force a retryable outcome. The controller destructures
// processMessage at require time, so the captured reference must be the thing
// that varies, not the property on this object.
let nextOutcome = 'enqueued';
const webhookControllerMock = {
  processMessage: async ({ message, value }) => {
    processed.push({ message, value });
    return { outcome: nextOutcome };
  },
  OUTCOMES: { FAILED: 'failed', CLAIMING_CONFLICT: 'claiming_conflict' },
  handleIncomingMessage: async () => {},
};

injectMock('common/prisma', prismaMock);
injectMock('services/telegram.service', telegramMock);
injectMock('controllers/webhook.controller', webhookControllerMock);
injectMock('observability/metrics', { increment: () => {} });
injectMock('observability/errors', { captureException: () => {} });

const telegramController = require('../src/controllers/telegram.controller');

const reset = () => {
  links.clear();
  sent.length = 0;
  processed.length = 0;
  nextOutcome = 'enqueued';
};

const update = (message, id = 1) => ({ update_id: id, message });

const baseMessage = (overrides = {}) => ({
  message_id: 10,
  date: 1757332800,
  chat: { id: 987654321, type: 'private' },
  from: { id: 987654321, first_name: 'Ada', username: 'adaobi' },
  ...overrides,
});

test('an unlinked chat is asked to share its number and nothing is enqueued', async () => {
  reset();
  const result = await telegramController.processUpdate(
    update(baseMessage({ text: 'send 5000 to 08012345678' })),
  );

  assert.equal(result.outcome, 'needs_contact');
  // The command must not reach the pipeline: there is no verified identity to
  // attribute a money movement to.
  assert.equal(processed.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'requestContact');
});

test('/start from an unlinked chat gets the full welcome copy', async () => {
  reset();
  const result = await telegramController.processUpdate(update(baseMessage({ text: '/start' })));

  assert.equal(result.outcome, 'needs_contact');
  assert.equal(sent[0].method, 'requestContact');
  assert.match(sent[0].text, /Welcome to Telex/);
});

test('sharing a self-owned contact links the chat and confirms', async () => {
  reset();
  const result = await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348012345678', user_id: 987654321 } })),
  );

  assert.equal(result.outcome, 'linked');
  assert.equal(result.phoneNumber, '+2348012345678');
  assert.equal(links.get('987654321').phoneNumber, '+2348012345678');
  // clearKeyboard, not sendMessage: the contact button has served its purpose
  // and should stop occupying the composer.
  assert.equal(sent[0].method, 'clearKeyboard');
});

test('a forwarded third-party contact does not link the chat', async () => {
  reset();
  const result = await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348099999999', user_id: 555000111 } })),
  );

  assert.equal(result.outcome, 'contact_contact_not_sender');
  assert.equal(links.size, 0);
  assert.equal(processed.length, 0);
});

test('once linked, a command flows into the shared pipeline addressed by phone', async () => {
  reset();
  await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348012345678', user_id: 987654321 } })),
  );
  sent.length = 0;

  const result = await telegramController.processUpdate(
    update(baseMessage({ message_id: 11, text: 'balance' }), 2),
  );

  assert.equal(result.outcome, 'enqueued');
  assert.equal(processed.length, 1);

  const { message, value } = processed[0];
  assert.equal(message.from, '+2348012345678');
  assert.equal(message.id, 'tg:987654321:11');
  assert.deepEqual(message.text, { body: 'balance' });
  // The channel is what tells the job consumer to fetch voice media from
  // Telegram rather than the Meta Graph API.
  assert.equal(value.channel, 'telegram');
});

test('a voice note from a linked chat reaches the pipeline as voice', async () => {
  reset();
  await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348012345678', user_id: 987654321 } })),
  );

  await telegramController.processUpdate(
    update(baseMessage({ message_id: 12, voice: { file_id: 'AwACAgQAAx', mime_type: 'audio/ogg' } }), 3),
  );

  const { message } = processed[0];
  assert.equal(message.type, 'voice');
  assert.equal(message.voice.id, 'AwACAgQAAx');
});

test('/start from a linked chat is a greeting, not a command', async () => {
  reset();
  await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348012345678', user_id: 987654321 } })),
  );
  processed.length = 0;

  const result = await telegramController.processUpdate(
    update(baseMessage({ message_id: 13, text: '/start' }), 4),
  );

  assert.equal(result.outcome, 'start');
  // Feeding "/start" to intent parsing would produce a nonsense reply.
  assert.equal(processed.length, 0);
});

test('a group chat message is rejected outright', async () => {
  reset();
  const result = await telegramController.processUpdate(
    update(baseMessage({ chat: { id: -100200300, type: 'group' }, text: 'balance' })),
  );

  assert.equal(result.outcome, 'invalid');
  assert.equal(processed.length, 0);
});

test('a malformed envelope is acknowledged rather than retried forever', async () => {
  reset();
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.body = body; return res; };

  await telegramController.handleIncomingUpdate({ body: { nonsense: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(processed.length, 0);
});

test('a retryable pipeline failure refuses acknowledgement so Telegram redelivers', async () => {
  reset();
  await telegramController.processUpdate(
    update(baseMessage({ contact: { phone_number: '2348012345678', user_id: 987654321 } })),
  );

  nextOutcome = 'failed';
  const res = { statusCode: null, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.body = body; return res; };

  await telegramController.handleIncomingUpdate(
    { body: update(baseMessage({ message_id: 14, text: 'balance' }), 5) },
    res,
  );

  // 503 is the backpressure signal: Telegram redelivers, and the shared claim
  // table makes the retry idempotent for anything already enqueued.
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, 'QUEUE_UNAVAILABLE');
});
