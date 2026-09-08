const axios = require('axios');
const config = require('../config/env');
const { sendTextMessage } = require('../services/messaging.service');
const { processMessage } = require('../conversation/assistant.service');
const prisma = require('../common/prisma');
const { canonicalizePhoneNumber } = require('../utils/validators');
const { ProviderSkippedError } = require('../compliance/providerErrors');
const { outboundHeaders } = require('../observability/context');

const transcribeWithDeepgram = async (audioBuffer) => {
  if (!config.voice.deepgramApiKey) {
    throw new Error('Deepgram is not configured. Set DEEPGRAM_API_KEY.');
  }

  const response = await axios.post(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    audioBuffer,
    {
      headers: {
        Authorization: `Token ${config.voice.deepgramApiKey}`,
        'Content-Type': 'audio/ogg',
        ...outboundHeaders(),
      },
      timeout: 60000,
    }
  );

  return response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
};

const downloadWhatsAppMedia = async (mediaId) => {
  if (!config.whatsapp.token) {
    throw new Error('WhatsApp token is not configured.');
  }

  const metadata = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, ...outboundHeaders() },
    timeout: 30000,
  });

  const media = await axios.get(metadata.data.url, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, ...outboundHeaders() },
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  return Buffer.from(media.data);
};

/**
 * Fetch the audio bytes for an inbound voice note from whichever transport
 * delivered it. The two providers hand out media differently — Meta returns a
 * metadata document containing a signed URL, Telegram returns a relative file
 * path fetched from a separate file host — so the mediaId alone is not enough
 * to know where to look. `channel` travels with the job for exactly this.
 */
const downloadInboundMedia = async (mediaId, channel) => {
  if (channel === 'telegram') {
    const telegramService = require('../services/telegram.service');
    const { buffer } = await telegramService.downloadFile(mediaId);
    return buffer;
  }
  return downloadWhatsAppMedia(mediaId);
};

const processVoiceMessage = async ({ phoneNumber, whatsappName, mediaId, whatsappMessageId, channel = 'whatsapp' }) => {
  const canonicalPhone = canonicalizePhoneNumber(phoneNumber);
  let user = await prisma.user.findUnique({ where: { phoneNumber: canonicalPhone } });
  if (!user) user = await prisma.user.create({ data: { phoneNumber: canonicalPhone, whatsappName } });

  const record = await prisma.voiceCommand.create({
    data: {
      userId: user.id,
      phoneNumber: canonicalPhone,
      whatsappMessageId,
      status: 'queued',
    },
  });

  const notificationMeta = {
    userId: user.id,
    type: 'voice_reply',
    referenceType: 'voiceCommand',
    referenceId: record.id,
  };

  try {
    await sendTextMessage(canonicalPhone, 'Got your voice note. I am checking the payment details now.', {
      notification: notificationMeta,
    });
    const audio = await downloadInboundMedia(mediaId, channel);
    const transcript = await transcribeWithDeepgram(audio);

    await prisma.voiceCommand.update({
      where: { id: record.id },
      data: { transcript, status: 'transcribed' },
    });

    await processMessage(canonicalPhone, whatsappName, transcript);
  } catch (error) {
    await prisma.voiceCommand.update({
      where: { id: record.id },
      data: { status: 'failed', error: error.message },
    });
    await sendTextMessage(canonicalPhone, 'I could not read that voice note. Please try again or type the payment.', {
      notification: notificationMeta,
    });
  }
};

// Best-effort deletion of voice/media data for a customer. We do not persist
// media blobs (transcripts are stored in VoiceCommand), so this mainly signals
// deletion to the transcription provider when configured; otherwise it skips.
const deleteUserData = async (userId) => {
  const url = config.voice.dataDeletionUrl || process.env.DEEPGRAM_DATA_DELETION_URL;
  if (!url) throw new ProviderSkippedError('Voice/media data deletion not configured');
  await axios.post(url, { user_id: userId }, { timeout: 30000, headers: { 'content-type': 'application/json', ...outboundHeaders() } });
  return { status: 'success' };
};

module.exports = {
  processVoiceMessage,
  deleteUserData,
};
