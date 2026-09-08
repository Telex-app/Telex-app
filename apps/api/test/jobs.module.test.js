const { test } = require('node:test');
const assert = require('node:assert/strict');

// Env must be set before any src module is loaded: config/env and
// crypto.service both throw on a missing key at require time.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'b'.repeat(64);
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.PIN_PEPPER = 'test-pepper';
process.env.NODE_ENV = 'development';

/**
 * Guards the worker's entrypoint module against syntax and wiring breakage.
 *
 * This exists because src/jobs/index.js was for some time a hard syntax error —
 * a merge left an object literal unterminated with a second `return` inside it —
 * and nothing failed. The worker lifecycle tests inject a mock for 'jobs/index',
 * so they never load the real file, and no other test required it either. The
 * result was a worker that could not start at all while the suite stayed green.
 *
 * Requiring the real module is the whole point here: do not mock it.
 */
test('the real jobs module parses and exports registerJobs', () => {
  const jobs = require('../src/jobs');
  assert.equal(typeof jobs.registerJobs, 'function');
});

test('the real worker entrypoint parses', () => {
  // worker.js pulls in the queue, messaging and job layers, so this transitively
  // covers the modules the worker cannot start without.
  assert.doesNotThrow(() => require('../src/worker.js'));
});
