'use strict';

/**
 * PII and secret redaction.
 *
 * This is production code. It previously lived in test/contract/helpers.js and
 * was required from src/queues/dlq.service.js, which made the test directory a
 * runtime dependency of the DLQ: any build that ships only `src/` (a Dockerfile
 * copying src, an npm `files` allowlist, `npm prune`) would have thrown at
 * require time, in the one code path whose whole job is to keep customer phone
 * numbers out of operator-visible logs.
 *
 * The contract test helper now re-exports these, so there is a single
 * implementation and the redaction rules cannot drift between the code that
 * redacts DLQ records and the tests asserting that redaction happens.
 */

/**
 * Strip bearer tokens, credential-shaped key/value pairs, phone numbers and
 * email addresses from a string.
 *
 * @param {unknown} input
 * @returns {string}
 */
function redact(input) {
  if (typeof input !== 'string') return String(input);
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|secret|token|password)[=:]\s*["']?[^"'\s&]+/gi, '$1=[REDACTED]')
    .replace(/\b\d{10,15}\b/g, '[PHONE_REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]');
}

/**
 * JSON.stringify that blanks secret-looking field names and then runs the
 * result through `redact`, so neither the keys nor the values leak.
 *
 * @param {unknown} value
 * @returns {string}
 */
function safeJson(value) {
  try {
    return redact(
      JSON.stringify(value, (key, val) => {
        if (
          typeof key === 'string'
          && /secret|token|password|apiKey|api_key|authorization/i.test(key)
        ) {
          return '[REDACTED]';
        }
        return val;
      }),
    );
  } catch {
    return '[unserializable]';
  }
}

module.exports = { redact, safeJson };
