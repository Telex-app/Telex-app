const prisma = require('../common/prisma');
const { sendSuccess, sendError } = require('../utils/response');
const { buildStandardReceipt, RECEIPT_PREFIXES } = require('../services/receipt.service');

const verifyReceipt = async (req, res, next) => {
  try {
    const rawId = req.params.id || '';
    // Accept both the current 'TLX-' prefix and the pre-rebrand 'SDA-' one,
    // so receipt links issued before the rename still resolve.
    const transactionId = RECEIPT_PREFIXES.find((prefix) => rawId.startsWith(prefix))
      ? rawId.slice(4)
      : rawId;

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        user: {
          select: {
            phoneNumber: true,
          },
        },
      },
    });

    if (!transaction) {
      return sendError(res, 'Receipt not found', 404);
    }

    const receipt = buildStandardReceipt(transaction, { mask: true });

    return sendSuccess(res, { receipt }, 'Receipt verified successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyReceipt,
};
