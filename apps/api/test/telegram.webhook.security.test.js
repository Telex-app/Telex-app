const { test } = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config/env');
const verifyTelegramSecret = require('../src/middlewares/verifyTelegramSecret');
const { matchesAnySecret } = verifyTelegramSecret;

const SECRET = 'a'.repeat(40);

/** Minimal express req/res doubles: only what the middleware touches. */
const makeReq = ({ headers = {}, secure = true } = {}) => ({
  secure,
  get: (name) => headers[name] || headers[name.toLowerCase()] || undefined,
});

const makeRes = () => {
  const res = { statusCode: null };
  res.sendStatus = (code) => {
    res.statusCode = code;
    return res;
  };
  return res;
};

/** Swap config values for one assertion, always restoring them afterwards. */
const withConfig = async (overrides, fn) => {
  const originalTelegram = { ...config.telegram };
  const originalProduction = config.isProduction;
  Object.assign(config.telegram, overrides.telegram || {});
  if ('isProduction' in overrides) config.isProduction = overrides.isProduction;
  try {
    await fn();
  } finally {
    Object.assign(config.telegram, originalTelegram);
    config.isProduction = originalProduction;
  }
};

test('accepts a request carrying the configured secret token', async () => {
  await withConfig({ telegram: { webhookSecret: SECRET }, isProduction: false }, () => {
    const req = makeReq({ headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, true);
    assert.equal(res.statusCode, null);
  });
});

test('rejects a request with the wrong secret token', async () => {
  await withConfig({ telegram: { webhookSecret: SECRET }, isProduction: false }, () => {
    const req = makeReq({ headers: { 'X-Telegram-Bot-Api-Secret-Token': 'b'.repeat(40) } });
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, false);
    assert.equal(res.statusCode, 403);
  });
});

test('rejects a request with no secret token header at all', async () => {
  await withConfig({ telegram: { webhookSecret: SECRET }, isProduction: false }, () => {
    const req = makeReq();
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, false);
    assert.equal(res.statusCode, 403);
  });
});

test('fails closed in production when no secret is configured', async () => {
  // The webhook URL is public. Without the secret there is nothing separating a
  // real Telegram update from a forged payment command.
  await withConfig({ telegram: { webhookSecret: '' }, isProduction: true }, () => {
    const req = makeReq({ headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, false);
    assert.equal(res.statusCode, 403);
  });
});

test('allows unsigned requests in development so local tunnels work', async () => {
  await withConfig({ telegram: { webhookSecret: '' }, isProduction: false }, () => {
    const req = makeReq();
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, true);
  });
});

test('refuses to accept the secret token over plaintext in production', async () => {
  // Telegram's token is a bearer credential, not a body signature: anyone who
  // observes one cleartext request can replay forged updates forever.
  await withConfig({ telegram: { webhookSecret: SECRET }, isProduction: true }, () => {
    const req = makeReq({ headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET }, secure: false });
    const res = makeRes();
    let advanced = false;

    verifyTelegramSecret(req, res, () => { advanced = true; });

    assert.equal(advanced, false);
    assert.equal(res.statusCode, 403);
  });
});

test('accepts either value while a rotation is in flight', async () => {
  const previous = 'c'.repeat(40);
  await withConfig({ telegram: { webhookSecret: `${SECRET},${previous}` }, isProduction: false }, () => {
    for (const token of [SECRET, previous]) {
      const req = makeReq({ headers: { 'X-Telegram-Bot-Api-Secret-Token': token } });
      const res = makeRes();
      let advanced = false;
      verifyTelegramSecret(req, res, () => { advanced = true; });
      assert.equal(advanced, true, `expected ${token.slice(0, 4)}... to be accepted`);
    }
  });
});

test('comparison tolerates length differences without throwing', () => {
  // timingSafeEqual throws on unequal buffer lengths; hashing first is what
  // keeps a short forged token a plain rejection rather than a 500.
  assert.equal(matchesAnySecret('short', [SECRET]), false);
  assert.equal(matchesAnySecret('x'.repeat(500), [SECRET]), false);
  assert.equal(matchesAnySecret(SECRET, [SECRET]), true);
});
