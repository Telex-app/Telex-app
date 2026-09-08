const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  toInboundValue,
  classifyUpdate,
  displayNameFrom,
  isStartCommand,
} = require('../src/telegram/normalizer');

const PHONE = '+2348012345678';

const message = (overrides = {}) => ({
  message_id: 42,
  date: 1757332800,
  chat: { id: 987654321, type: 'private' },
  from: { id: 987654321, first_name: 'Ada', last_name: 'Obi', username: 'adaobi' },
  text: 'balance',
  ...overrides,
});

test('namespaces the message id by chat so per-chat ids cannot collide', () => {
  // Telegram message_id restarts per chat, so the bare number is not a safe
  // dedup key across users — two people can both send message_id 42.
  const a = toInboundValue(message(), PHONE).message;
  const b = toInboundValue(
    message({ chat: { id: 111222333, type: 'private' } }),
    '+2348099999999',
  ).message;

  assert.equal(a.id, 'tg:987654321:42');
  assert.equal(b.id, 'tg:111222333:42');
  assert.notEqual(a.id, b.id);
});

test('addresses the message by phone number, not chat id', () => {
  // Everything downstream (recipient resolution, pending claims, rate-limit
  // keys) is keyed on the phone number; leaking a chat id into `from` would
  // silently create a second identity namespace.
  const { message: normalized } = toInboundValue(message(), PHONE);
  assert.equal(normalized.from, PHONE);
});

test('maps a text message into the shape the shared pipeline consumes', () => {
  const { value, message: normalized } = toInboundValue(message(), PHONE);

  assert.equal(normalized.type, 'text');
  assert.deepEqual(normalized.text, { body: 'balance' });
  assert.equal(normalized.timestamp, '1757332800');
  assert.equal(value.channel, 'telegram');
  assert.equal(value.contacts[0].profile.name, 'Ada Obi');
});

test('preserves the unix-second timestamp unit Meta uses', () => {
  // ordering.service.js multiplies this by 1000; a milliseconds value here
  // would push every Telegram message ~55,000 years into the future and
  // permanently win every ordering comparison.
  const { message: normalized } = toInboundValue(message({ date: 1757332800 }), PHONE);
  assert.equal(Number(normalized.timestamp) * 1000, 1757332800000);
});

test('maps a voice note onto the voice branch with its file_id', () => {
  const { message: normalized } = toInboundValue(
    message({ text: undefined, voice: { file_id: 'AwACAgQAAx', mime_type: 'audio/ogg' } }),
    PHONE,
  );

  assert.equal(normalized.type, 'voice');
  assert.equal(normalized.voice.id, 'AwACAgQAAx');
  // The consumer reads `message.audio?.id || message.voice?.id`, so the id must
  // live under a key matching the declared type.
  assert.equal(normalized.text, undefined);
});

test('maps an audio file onto the audio branch', () => {
  const { message: normalized } = toInboundValue(
    message({ text: undefined, audio: { file_id: 'BQACAgQAAy', mime_type: 'audio/mpeg' } }),
    PHONE,
  );

  assert.equal(normalized.type, 'audio');
  assert.equal(normalized.audio.id, 'BQACAgQAAy');
});

test('classifies a contact share ahead of a normal message', () => {
  // A contact share is how an unlinked chat becomes linked, so it must be
  // recognised before the "is this chat linked?" gate rejects it.
  const classified = classifyUpdate({
    update_id: 1,
    message: message({ text: undefined, contact: { phone_number: '2348012345678', user_id: 987654321 } }),
  });

  assert.equal(classified.kind, 'contact');
  assert.equal(classified.contact.phone_number, '2348012345678');
  assert.equal(classified.senderId, '987654321');
});

test('ignores updates that carry no message', () => {
  const classified = classifyUpdate({ update_id: 7, edited_message: message() });
  assert.equal(classified.kind, 'ignored');
});

test('recognises /start with and without a deep-link payload', () => {
  assert.equal(isStartCommand({ text: '/start' }), true);
  assert.equal(isStartCommand({ text: '/start ref_abc123' }), true);
  assert.equal(isStartCommand({ text: '/start@telex_bot' }), true);
  assert.equal(isStartCommand({ text: 'balance' }), false);
  // Guard against a naive prefix match swallowing a real command.
  assert.equal(isStartCommand({ text: '/started' }), false);
});

test('falls back through name fields for the display name', () => {
  assert.equal(displayNameFrom({ first_name: 'Ada', last_name: 'Obi' }), 'Ada Obi');
  assert.equal(displayNameFrom({ first_name: 'Ada' }), 'Ada');
  assert.equal(displayNameFrom({ username: 'adaobi' }), '@adaobi');
  assert.equal(displayNameFrom({}), '');
});
