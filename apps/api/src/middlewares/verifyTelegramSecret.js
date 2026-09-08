const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Verifies the X-Telegram-Bot-Api-Secret-Token header Telegram attaches to every
 * webhook POST, using the value registered with setWebhook.
 *
 * This is the Telegram counterpart to verifyWhatsappSignature, and it is worth
 * being explicit about how it is weaker. Meta signs the request body, so a
 * captured header is useless against different content. Telegram sends a static
 * shared secret, so the header IS the credential: anyone who observes one
 * request can replay arbitrary forged updates, including a payment command with
 * someone else's chat id.
 *
 * Two consequences, both enforced here:
 *   - HTTPS is mandatory. Over plaintext the token is trivially harvested, so a
 *     non-TLS request is rejected in production rather than merely warned about.
 *   - Comma-separated secrets are supported so the token can be rotated the
 *     same way WHATSAPP_APP_SECRET is, with setWebhook re-registered against
 *     the new active value once both are accepted.
 *
 * Fail-closed in production: with TELEGRAM_WEBHOOK_SECRET unset, every POST is
 * rejected. Development allows unsigned requests with a warning so local
 * testing against a tunnel works without the secret.
 */
const secretList = () =>
  String(config.telegram?.webhookSecret || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Constant-time compare that does not leak length through an early return. */
const matchesAnySecret = (presented, secrets) => {
  const presentedHash = crypto.createHash('sha256').update(presented).digest();
  let matched = false;
  for (const secret of secrets) {
    const secretHash = crypto.createHash('sha256').update(secret).digest();
    if (crypto.timingSafeEqual(presentedHash, secretHash)) matched = true;
  }
  return matched;
};

const verifyTelegramSecret = (req, res, next) => {
  const secrets = secretList();

  if (secrets.length === 0) {
    if (config.isProduction) {
      logger.error('TELEGRAM_WEBHOOK_SECRET is not set in production — rejecting webhook POST.');
      return res.sendStatus(403);
    }
    logger.warn('TELEGRAM_WEBHOOK_SECRET is not set; skipping secret check (development only).');
    return next();
  }

  // The secret token travels in cleartext in a header, so refuse to accept it
  // over a connection that did not terminate TLS. `req.secure` honours the
  // configured trust proxy setting, matching how the rest of the app treats
  // forwarded requests.
  if (config.isProduction && !req.secure) {
    logger.error('telegram_webhook_rejected', { reason: 'insecure_transport' });
    return res.sendStatus(403);
  }

  const presented = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!presented) {
    logger.warn('telegram_webhook_secret_rejected', { reason: 'missing' });
    return res.sendStatus(403);
  }

  if (!matchesAnySecret(presented, secrets)) {
    logger.warn('telegram_webhook_secret_rejected', { reason: 'mismatch' });
    return res.sendStatus(403);
  }

  return next();
};

module.exports = verifyTelegramSecret;
module.exports.matchesAnySecret = matchesAnySecret;
