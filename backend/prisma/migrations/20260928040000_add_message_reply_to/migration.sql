-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "replyToMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 기존 팬 답장 채우기: 같은 배우의, 답장 시각 이전 가장 최근 스타 메시지에 묶음(새 답장과 같은 규칙)
UPDATE "Message" AS fan
SET "replyToMessageId" = (
  SELECT artist."id" FROM "Message" AS artist
  WHERE artist."actorId" = fan."actorId"
    AND artist."senderType" = 'ARTIST'
    AND artist."createdAt" <= fan."createdAt"
  ORDER BY artist."createdAt" DESC
  LIMIT 1
)
WHERE fan."senderType" = 'FAN' AND fan."replyToMessageId" IS NULL;
