
// Receipt id prefix. 'SDA-' predates the Telex rebrand; it is still accepted
// on lookup so receipts already in customers' chat history keep resolving.
const RECEIPT_PREFIX = 'TLX-';
const RECEIPT_PREFIXES = ['TLX-', 'SDA-'];

/**
 * Public URL a customer can open to verify a receipt, or null when
 * PUBLIC_APP_URL is unset. The deployment domain is configuration, not a
 * constant, so callers must handle null rather than assume a host.
 */
const receiptVerifyUrl = (receiptId) => (
  config.publicAppUrl ? `${config.publicAppUrl}/receipt/${receiptId}` : null
);
const prisma = require('../common/prisma');
const config = require('../config/env');

const maskValue = (value) => {
  if (!value) return null;
  if (value.length <= 7) return '***';
  return value.slice(0, 4) + '*'.repeat(Math.max(value.length - 8, 3)) + value.slice(-4);
};

/**
 * Builds a standardized receipt structure with complete financial metadata.
 */
const buildStandardReceipt = (transaction, options = {}) => {
  const meta = transaction.metadata || {};
  const isMasked = options.mask !== false;

  const senderRaw = transaction.user?.phoneNumber || transaction.senderAddress || null;
  const recipientRaw = transaction.recipientPhoneNumber || transaction.destination || null;

  const sender = isMasked ? maskValue(senderRaw) : senderRaw;
  const recipient = isMasked ? maskValue(recipientRaw) : recipientRaw;

  const timestamp = transaction.createdAt
    ? new Date(transaction.createdAt).toISOString()
    : new Date().toISOString();

  // 'SDA-' is the pre-rebrand prefix. Ids already issued under it stay
  // valid — see RECEIPT_PREFIXES and receipt.controller.js — so only newly
  // minted ids carry 'TLX-'.
  const receiptId = RECEIPT_PREFIXES.some((prefix) => transaction.id?.startsWith(prefix))
    ? transaction.id
    : `${RECEIPT_PREFIX}${transaction.id}`;

  return {
    receiptId,
    transactionId: transaction.id,
    transactionHash: transaction.txHash || 'pending',
    asset: transaction.asset || 'XLM',
    amount: transaction.amount || '0',
    fee: meta.fee || '0.0000000',
    status: transaction.status || 'success',
    timestamp,
    time: timestamp,
    parties: {
      sender,
      recipient,
    },
    recipient,
    sender,
    receiptUrl: transaction.explorerUrl || receiptVerifyUrl(receiptId),
    quoteId: transaction.quoteId || null,
    metadata: {
      rail: transaction.rail || 'stellar',
      memo: meta.memo || null,
      memoType: meta.memoType || null,
      network: transaction.network || null,
      assetIssuer: transaction.assetIssuer || null,
    },
  };
};

/**
 * Formats a standardized confirmation message for WhatsApp and messaging channels.
 */
const formatChannelReceiptMessage = (receipt) => {
  const isSuccess = receipt.status === 'success';
  const statusEmoji = isSuccess ? '✅' : (receipt.status === 'pending' ? '⏳' : '❌');
  const statusHeader = isSuccess ? 'Payment Successful' : (receipt.status === 'pending' ? 'Payment Processing' : 'Payment Failed');

  const lines = [
    `${statusEmoji} *${statusHeader}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `• *Receipt ID:* \`${receipt.receiptId}\``,
    `• *Status:* ${receipt.status}`,
    `• *Amount:* ${receipt.amount} ${receipt.asset}`,
    `• *Fee:* ${receipt.fee} ${receipt.asset}`,
    `• *Recipient:* ${receipt.recipient || 'N/A'}`,
    `• *Time:* ${receipt.timestamp}`,
  ];

  if (receipt.transactionHash && receipt.transactionHash !== 'pending') {
    lines.push(`• *Tx Hash:* \`${receipt.transactionHash.slice(0, 10)}...${receipt.transactionHash.slice(-6)}\``);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  // Printing a guessed domain into a customer's chat is worse than printing
  // nothing, so the verify line appears only when a host is configured.
  const verifyUrl = receiptVerifyUrl(receipt.receiptId);
  if (verifyUrl) lines.push(`Verify receipt: ${verifyUrl}`);

  return lines.join('\n');
};

/**
 * Emits a receipt delivery confirmation event.
 */
const recordReceiptDeliveryEvent = async ({
  receiptId,
  transactionId,
  userId,
  channel = 'whatsapp',
  status = 'dispatched',
  recipient,
  providerMessageId = null,
  db = prisma,
}) => {
  try {
    if (db.notification && db.notification.create) {
      await db.notification.create({
        data: {
          userId: userId || null,
          channel,
          type: 'transaction_receipt',
          recipient: recipient || 'unknown',
          body: `Receipt ${receiptId} delivery event: ${status}`,
          status,
          providerMessageId,
          referenceType: 'transaction',
          referenceId: transactionId || receiptId,
          sentAt: new Date(),
        },
      });
    }
  } catch (err) {
    // Non-blocking delivery audit logging
    console.warn(`[ReceiptService] Failed to record receipt delivery event: ${err.message}`);
  }
};

module.exports = {
  maskValue,
  receiptVerifyUrl,
  RECEIPT_PREFIX,
  RECEIPT_PREFIXES,
  buildStandardReceipt,
  formatChannelReceiptMessage,
  recordReceiptDeliveryEvent,
};
