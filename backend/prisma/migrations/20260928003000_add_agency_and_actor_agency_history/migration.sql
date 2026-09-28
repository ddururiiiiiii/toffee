-- 소속사(Agency) 도입 — 배우↔스태프 개별 연결(_ActorStaff)을 "같은 소속사면 전원 조회"로 교체.
-- 출시 전(실데이터 없음)이라 _ActorStaff의 기존 연결은 옮기지 않고 그대로 삭제함 —
-- 개발 DB는 `npm run db:seed`로 다시 채울 것.

-- DropForeignKey
ALTER TABLE "_ActorStaff" DROP CONSTRAINT "_ActorStaff_A_fkey";

-- DropForeignKey
ALTER TABLE "_ActorStaff" DROP CONSTRAINT "_ActorStaff_B_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agencyId" TEXT;

-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "agencyId" TEXT;

-- DropTable
DROP TABLE "_ActorStaff";

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorAgencyHistory" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorAgencyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_name_key" ON "Agency"("name");

-- CreateIndex
CREATE INDEX "ActorAgencyHistory_actorId_idx" ON "ActorAgencyHistory"("actorId");

-- CreateIndex
CREATE INDEX "ActorAgencyHistory_agencyId_idx" ON "ActorAgencyHistory"("agencyId");

-- CreateIndex
CREATE INDEX "Actor_agencyId_idx" ON "Actor"("agencyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorAgencyHistory" ADD CONSTRAINT "ActorAgencyHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorAgencyHistory" ADD CONSTRAINT "ActorAgencyHistory_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

