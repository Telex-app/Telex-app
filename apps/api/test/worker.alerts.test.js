const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = fs.readFileSync(path.resolve(__dirname, '../../../observability/prometheus-rules.yml'), 'utf8');

test('alerts distinguish API availability from worker availability', () => {
  assert.match(rules, /alert: TelexApiDown[\s\S]*up\{job="telex-api"\}/);
  assert.match(rules, /alert: TelexWorkerDown[\s\S]*up\{job="telex-worker"\}/);
  assert.match(rules, /alert: TelexWorkerNotReady[\s\S]*telex_worker_ready == 0/);
});

test('alerts cover wedged queues and stale deposit sweeps', () => {
  assert.match(rules, /alert: TelexQueueLagHigh[\s\S]*telex_queue_oldest_job_age_seconds/);
  assert.match(rules, /alert: TelexQueueStalled[\s\S]*telex_queue_stalled_jobs_total/);
  assert.match(rules, /alert: TelexDepositSweepStale[\s\S]*telex_deposit_sweep_age_seconds/);
});
