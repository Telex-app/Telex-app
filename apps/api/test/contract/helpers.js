/**
 * Shared helpers for provider contract / sandbox tests.
 * - Hermetic tests never require secrets.
 * - Credentialed tests skip cleanly when env vars are missing.
 * - Logs must not print secrets or PII.
 */

// Redaction is production code (src/queues/dlq.service.js redacts DLQ records
// with it), so it lives in src and is re-exported here. One implementation
// means the tests assert the same rules the DLQ actually applies.
const { redact, safeJson } = require("../../src/utils/redact");

const REQUIRED_FOR_CREDENTIALED = {
  smileId: ["SMILE_ID_API_KEY", "SMILE_ID_PARTNER_ID"],
  pricing: ["EXCHANGE_RATE_API_KEY"],
  // Meta/Stellar contract checks can run hermetically; optional live keys:
  meta: ["WHATSAPP_APP_SECRET"],
  stellar: [], // public Horizon/testnet — no secret required for read-only
};

/**
 * Returns true when every listed env var is non-empty.
 * @param {string[]} keys
 */
function hasEnv(keys) {
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * Skip the current test when credentialed env is missing.
 * Use at the start of credentialed tests so PR CI stays green without secrets.
 * @param {keyof typeof REQUIRED_FOR_CREDENTIALED} provider
 * @param {{ skip: (msg?: string) => void }} t  node:test context
 */
function skipUnlessCredentials(provider, t) {
  const keys = REQUIRED_FOR_CREDENTIALED[provider] || [];
  if (!hasEnv(keys)) {
    const missingKeys = keys.filter((k) => !process.env[k] || !process.env[k].trim()).join(", ") || "(none)";
    if (process.env.REQUIRE_CONTRACT_SECRETS === "true" || process.env.REQUIRE_CONTRACT_SECRETS === "1") {
      throw new Error(`Scheduled provider contract test failed: missing required environment variables for ${provider}: ${missingKeys}`);
    }
    t.skip(
      `Skipping ${provider} credentialed contract test — missing env: ${missingKeys}`,
    );
    return true;
  }
  return false;
}

/**
 * Redact secrets and obvious PII from strings before logging/assert messages.
 * @param {string} input
 * @returns {string}
 */

/**
 * Safe JSON stringify that redacts common secret field names.
 * @param {unknown} value
 */

module.exports = {
  REQUIRED_FOR_CREDENTIALED,
  hasEnv,
  skipUnlessCredentials,
  redact,
  safeJson,
};
