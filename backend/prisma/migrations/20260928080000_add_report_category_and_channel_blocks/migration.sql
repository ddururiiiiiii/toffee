-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('SPAM', 'ABUSE', 'SEXUAL', 'PRIVACY', 'OTHER');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "category" "ReportCategory" NOT NULL DEFAULT 'OTHER',
ALTER COLUMN "reason" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ActorFanBlock" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fanUserId" TEXT NOT NULL,
    "blockedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorFanBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActorFanBlock_fanUserId_idx" ON "ActorFanBlock"("fanUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ActorFanBlock_actorId_fanUserId_key" ON "ActorFanBlock"("actorId", "fanUserId");

-- 같은 사람이 같은 메시지를 여러 번 신고한 기록이 있으면 가장 먼저 한 것만 남김(유니크 인덱스 전에)
DELETE FROM "Report" r
USING "Report" earlier
WHERE r."messageId" = earlier."messageId"
  AND r."reportedById" = earlier."reportedById"
  AND (r."createdAt", r."id") > (earlier."createdAt", earlier."id");

-- CreateIndex
CREATE UNIQUE INDEX "Report_messageId_reportedById_key" ON "Report"("messageId", "reportedById");

-- AddForeignKey
ALTER TABLE "ActorFanBlock" ADD CONSTRAINT "ActorFanBlock_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorFanBlock" ADD CONSTRAINT "ActorFanBlock_fanUserId_fkey" FOREIGN KEY ("fanUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorFanBlock" ADD CONSTRAINT "ActorFanBlock_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

