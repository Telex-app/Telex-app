const { registerInboundJobs } = require('./inbound.jobs');
const { startDepositPoller } = require('./deposits.jobs');
const { startAuditPoller } = require('./audit.jobs');
const { JOB_NAME, runRotationHealthCheck, rotateCategorySecret } = require('./secret-rotation.job');
const { enqueue, registerProcessor } = require('../queues/queue.service');
const config = require('../config/env');
const logger = require('../utils/logger');

const registerSecretRotationJobs = () => {
  registerProcessor(JOB_NAME, async (job, token) => {
    const action = job.name;
    if (action === 'health-check') {
      return runRotationHealthCheck();
    }
    if (action === 'rotate') {
      const { category, rotatedBy } = job.data || {};
      return rotateCategorySecret({ category, rotatedBy });
    }
    throw new Error(`Unknown secret rotation job action: ${action}`);
  });

  const startRotationScheduler = () => {
    const intervalMs = (config.worker?.lockDurationMs || 30000) * 2;
    setInterval(async () => {
      try {
        await enqueue('telex-jobs', JOB_NAME, { action: 'health-check' }, { jobId: `rotation-health-${Date.now()}` });
      } catch (error) {
        logger.warn('secret_rotation_schedule_failed', { error: error.message });
      }
    }, intervalMs).unref();
    logger.info('secret_rotation_scheduler_started', { intervalMs });
  };

  return { startRotationScheduler };
};
const { startWebhookInboxDrain, startOutboxReconciler } = require('./messaging.jobs');

const registerJobs = () => {
  const inboundWorker = registerInboundJobs();
  const depositPoller = startDepositPoller();
  const auditPoller = startAuditPoller();
  const rotationJobs = registerSecretRotationJobs();
  const inboxDrain = startWebhookInboxDrain();
  const outboxReconciler = startOutboxReconciler();
  return {
    inboundWorker,
    depositPoller,
    auditPoller,
    rotationJobs,
    inboxDrain,
    outboxReconciler,
    processorNames: ['messaging-inbound'],
    stop: async () => {
      depositPoller.stop();
      auditPoller.stop();
      inboxDrain.stop();
      outboxReconciler.stop();
    },
  };
};

module.exports = {
  registerJobs,
};
