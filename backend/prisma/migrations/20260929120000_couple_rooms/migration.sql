-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('SOLO', 'COUPLE');

-- DropForeignKey
ALTER TABLE "GlCp" DROP CONSTRAINT "GlCp_actorOneId_fkey";

-- DropForeignKey
ALTER TABLE "GlCp" DROP CONSTRAINT "GlCp_actorTwoId_fkey";

-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "kind" "ActorKind" NOT NULL DEFAULT 'SOLO';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "senderActorId" TEXT;

-- DropTable
DROP TABLE "GlCp";

-- CreateTable
CREATE TABLE "CoupleMember" (
    "coupleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "CoupleMember_pkey" PRIMARY KEY ("coupleId","memberId")
);

-- CreateIndex
CREATE INDEX "CoupleMember_memberId_idx" ON "CoupleMember"("memberId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderActorId_fkey" FOREIGN KEY ("senderActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupleMember" ADD CONSTRAINT "CoupleMember_coupleId_fkey" FOREIGN KEY ("coupleId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoupleMember" ADD CONSTRAINT "CoupleMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 기존 스타 메시지는 1인 방이라 보낸 배우 = 방 배우
UPDATE "Message" SET "senderActorId" = "actorId" WHERE "senderType" = 'ARTIST';
