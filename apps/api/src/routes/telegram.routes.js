const express = require('express');
const router = express.Router();
const verifyTelegramSecret = require('../middlewares/verifyTelegramSecret');
const telegramController = require('../controllers/telegram.controller');

// Telegram posts JSON. The raw body is captured for parity with the Meta
// webhook, even though Telegram's secret-token scheme does not sign the body,
// so request logging and future body-signing both have it available.
router.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

function requestTimeout(milliseconds) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      const err = new Error('Request timed out');
      err.status = 408;
      err.code = 'REQUEST_TIMEOUT';
      next(err);
    }, milliseconds);

    res.once('finish', () => clearTimeout(timer));
    next();
  };
}

// Deployment/liveness probe. Deliberately unauthenticated and free of secrets:
// it reports only which transport is active and whether Telegram credentials
// are present, never their values.
router.get('/', telegramController.webhookHealth);

// Inbound updates. The secret token is checked before the body is looked at.
router.post(
  '/',
  requestTimeout(30000),
  verifyTelegramSecret,
  telegramController.handleIncomingUpdate,
);

router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  if (err.code === 'REQUEST_TIMEOUT') {
    return res.status(err.status).json({ error: 'Request timed out' });
  }

  next(err);
});

module.exports = router;
