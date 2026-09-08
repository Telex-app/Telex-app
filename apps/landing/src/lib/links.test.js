import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_URL, GITHUB_URL, STELLAR_URL, telegramUrl, toStartPayload } from './links.js';

describe('telegramUrl', () => {
  it('falls back to the open t.me link when no bot handle is configured', () => {
    // apps/landing/.env.example ships VITE_TELEGRAM_BOT unset, and the test
    // environment doesn't set it either, so this exercises the default.
    expect(telegramUrl('create wallet')).toBe('https://t.me/');
  });

  it('falls back the same way when called with no arguments', () => {
    expect(telegramUrl()).toBe('https://t.me/');
  });
});

describe('telegramUrl with a configured bot handle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // TELEGRAM_BOT is read once at module load, so each case needs a fresh import.
  const loadWith = async (handle) => {
    vi.stubEnv('VITE_TELEGRAM_BOT', handle);
    vi.resetModules();
    return import('./links.js');
  };

  it('builds a t.me deep link carrying the start payload', async () => {
    const { telegramUrl } = await loadWith('telex_bot');
    expect(telegramUrl('create wallet')).toBe('https://t.me/telex_bot?start=create_wallet');
  });

  it('tolerates a handle written with a leading @', async () => {
    // BotFather displays handles as @telex_bot, so pasting that into the env
    // must not produce https://t.me/@telex_bot.
    const { telegramUrl } = await loadWith('@telex_bot');
    expect(telegramUrl('create wallet')).toBe('https://t.me/telex_bot?start=create_wallet');
  });

  it('omits the start parameter when the intent reduces to nothing', async () => {
    const { telegramUrl } = await loadWith('telex_bot');
    expect(telegramUrl('!!!')).toBe('https://t.me/telex_bot');
  });
});

describe('toStartPayload', () => {
  it("reduces a phrase to Telegram's allowed start-payload charset", () => {
    // Telegram bot deep links accept only A-Za-z0-9_- in `start`, and deliver
    // it as "/start <payload>" rather than as typed text, so a WhatsApp-style
    // URL-encoded sentence would be silently dropped.
    expect(toStartPayload('create wallet')).toBe('create_wallet');
  });

  it('collapses punctuation and runs of separators', () => {
    expect(toStartPayload('send 25000 NGN to Ada!')).toBe('send_25000_ngn_to_ada');
  });

  it('trims leading and trailing separators', () => {
    expect(toStartPayload('  balance!  ')).toBe('balance');
  });

  it("caps the payload at Telegram's 64-character limit", () => {
    expect(toStartPayload('a'.repeat(120))).toHaveLength(64);
  });
});

describe('configured link constants', () => {
  it('exposes an admin URL with a safe local default', () => {
    expect(ADMIN_URL).toBe('http://localhost:3001');
  });

  it('leaves the GitHub link empty until one is configured', () => {
    // No repository URL is published yet. An empty value is the signal for
    // consumers to omit the link; Footer filters on it rather than rendering
    // an anchor pointing nowhere.
    expect(GITHUB_URL).toBe('');
  });

  it('exposes the Stellar link', () => {
    expect(STELLAR_URL).toBe('https://stellar.org');
  });
});
