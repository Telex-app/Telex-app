-- Telegram identity bridge: maps a Telegram chat_id to the E.164 phone number
-- that the rest of Telex treats as the user's identity. Rows are only written
-- from a Telegram-verified `contact` share, never from user-typed input.
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");
CREATE UNIQUE INDEX "TelegramLink_phoneNumber_key" ON "TelegramLink"("phoneNumber");
CREATE INDEX "TelegramLink_phoneNumber_idx" ON "TelegramLink"("phoneNumber");
