// Central place for outbound links so the Telegram bot handle / admin URL are
// set once (via env) and reused across the nav, hero, and CTAs.

const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT || '').replace(/^@/, '');

export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:3001';
// Empty until a public repository exists. Consumers must omit the link when
// it is falsy rather than rendering a dead anchor.
export const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || '';
export const STELLAR_URL = 'https://stellar.org';

/**
 * Telegram's deep-link payload is far stricter than WhatsApp's `?text=`: bot
 * links carry a `start` parameter limited to A-Za-z0-9_- and 64 characters,
 * and it arrives as "/start <payload>" rather than as a typed message. Anything
 * outside that set is dropped by Telegram, so a prefilled sentence has to be
 * reduced to a token here instead of URL-encoded.
 */
export const toStartPayload = (intent = 'create wallet') =>
  String(intent)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

/**
 * Build a t.me deep link that opens the Telex bot. Without a configured handle
 * it falls back to t.me/ (lets the user pick the chat) so the button is never
 * broken in local/dev, matching the old wa.me behaviour.
 */
export const telegramUrl = (intent = 'create wallet') => {
  if (!TELEGRAM_BOT) return 'https://t.me/';
  const payload = toStartPayload(intent);
  return payload ? `https://t.me/${TELEGRAM_BOT}?start=${payload}` : `https://t.me/${TELEGRAM_BOT}`;
};
