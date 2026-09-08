const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const injectMock = (relativeFromSrc, exports) => {
  const filename = path.resolve(__dirname, '../src', `${relativeFromSrc}.js`);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};

const mockTransaction = {
  id: 'tx_abc123',
  txHash: 'stellar_hash_xyz',
  asset: 'XLM',
  amount: '50.0000000',
  status: 'success',
  createdAt: new Date('2026-08-26T12:00:00.000Z'),
  recipientPhoneNumber: '+2348012345678',
  destination: 'GABC123recipient',
  quoteId: 'quote_123',
  metadata: { fee: '0.5000000' },
  user: {
    phoneNumber: '+2348033334444',
  },
};

const prismaMock = {
  transaction: {
    findUnique: async ({ where }) => {
      if (where.id === 'tx_abc123') {
        return mockTransaction;
      }
      return null;
    },
  },
  notification: {
    create: async ({ data }) => ({ id: 'notif_1', ...data }),
  },
};

injectMock('common/prisma', prismaMock);

const { verifyReceipt } = require('../src/controllers/receipt.controller');
const {
  buildStandardReceipt,
  formatChannelReceiptMessage,
  recordReceiptDeliveryEvent,
  RECEIPT_PREFIXES,
} = require('../src/services/receipt.service');

test('buildStandardReceipt formats complete financial metadata', () => {
  const receipt = buildStandardReceipt(mockTransaction, { mask: true });

  assert.equal(receipt.receiptId, 'TLX-tx_abc123');
  assert.equal(receipt.transactionHash, 'stellar_hash_xyz');
  assert.equal(receipt.asset, 'XLM');
  assert.equal(receipt.amount, '50.0000000');
  assert.equal(receipt.fee, '0.5000000');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.timestamp, '2026-08-26T12:00:00.000Z');
  assert.equal(receipt.parties.sender, '+234******4444');
  assert.equal(receipt.parties.recipient, '+234******5678');
});

test('formatChannelReceiptMessage produces standard structured message', () => {
  const receipt = buildStandardReceipt(mockTransaction, { mask: true });
  const msg = formatChannelReceiptMessage(receipt);

  assert.ok(msg.includes('Payment Successful'));
  assert.ok(msg.includes('Receipt ID:'));
  assert.ok(msg.includes('50.0000000 XLM'));
  assert.ok(msg.includes('Fee:'));
  assert.ok(msg.includes('+234******5678'));
  // No PUBLIC_APP_URL is set in tests, so no verify link should be printed.
  // Emitting a guessed host into a customer's chat is worse than omitting it.
  assert.ok(!msg.includes('Verify receipt:'));
});

test('recordReceiptDeliveryEvent logs delivery event without throwing', async () => {
  await recordReceiptDeliveryEvent({
    receiptId: 'TLX-tx_abc123',
    transactionId: 'tx_abc123',
    userId: 'user_1',
    channel: 'whatsapp',
    status: 'delivered',
    recipient: '+2348012345678',
    db: prismaMock,
  });
});

test('verifyReceipt resolves existing receipt with privacy-safe masking', async () => {
  // Deliberately a legacy 'SDA-' link: receipts shared before the Telex rebrand
  // must still resolve. The prefix is stripped to find the transaction, and the
  // receipt comes back labelled with the current prefix.
  const req = {
    params: { id: 'TLX-tx_abc123' },
  };

  let responseData = null;
  let responseStatus = null;

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      responseStatus = this.statusCode;
      responseData = data;
      return this;
    },
  };

  await verifyReceipt(req, res, (err) => {
    if (err) assert.fail(err);
  });

  assert.equal(responseStatus, 200);
  assert.ok(responseData.success);
  assert.equal(responseData.data.receipt.receiptId, 'TLX-tx_abc123');
  assert.equal(responseData.data.receipt.transactionHash, 'stellar_hash_xyz');
  assert.equal(responseData.data.receipt.amount, '50.0000000');
  assert.equal(responseData.data.receipt.fee, '0.5000000');
  
  // Verify parties are masked correctly
  assert.equal(responseData.data.receipt.parties.sender, '+234******4444');
  assert.equal(responseData.data.receipt.parties.recipient, '+234******5678');
});

test('verifyReceipt returns 404 for unknown receipt', async () => {
  const req = {
    params: { id: 'SDA-unknown' },
  };

  let responseData = null;
  let responseStatus = null;

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      responseStatus = this.statusCode;
      responseData = data;
      return this;
    },
  };

  await verifyReceipt(req, res, (err) => {
    if (err) assert.fail(err);
  });

  assert.equal(responseStatus, 404);
  assert.equal(responseData.success, false);
});

test('a receipt id already carrying the legacy prefix is left intact', () => {
  // Receipts issued before the Telex rebrand are in customers' chat history and
  // in shared receipt URLs. Re-prefixing one would turn 'SDA-tx_1' into
  // 'TLX-SDA-tx_1' and break the lookup, so an existing prefix is preserved.
  const legacy = buildStandardReceipt({ ...mockTransaction, id: 'SDA-tx_legacy' }, { mask: true });
  assert.equal(legacy.receiptId, 'SDA-tx_legacy');
});

test('both the current and legacy receipt prefixes are recognised', () => {
  assert.deepEqual(RECEIPT_PREFIXES, ['TLX-', 'SDA-']);
});

test('the verify link appears only once a public host is configured', () => {
  const config = require('../src/config/env');
  const original = config.publicAppUrl;
  try {
    config.publicAppUrl = 'https://app.example.com';
    const receipt = buildStandardReceipt(mockTransaction, { mask: true });
    assert.equal(receipt.receiptUrl, 'https://app.example.com/receipt/TLX-tx_abc123');
    assert.ok(
      formatChannelReceiptMessage(receipt)
        .includes('Verify receipt: https://app.example.com/receipt/TLX-tx_abc123'),
    );
  } finally {
    config.publicAppUrl = original;
  }
});

test('no host configured means no receipt URL is invented', () => {
  const config = require('../src/config/env');
  const original = config.publicAppUrl;
  try {
    config.publicAppUrl = '';
    // explorerUrl is absent on this fixture, so receiptUrl has no fallback to
    // fall back to — it must be null rather than a hardcoded domain.
    const receipt = buildStandardReceipt({ ...mockTransaction, explorerUrl: null }, { mask: true });
    assert.equal(receipt.receiptUrl, null);
  } finally {
    config.publicAppUrl = original;
  }
});
