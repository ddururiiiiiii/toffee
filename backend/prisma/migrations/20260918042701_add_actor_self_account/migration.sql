-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACTOR';

-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "selfUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Actor_selfUserId_key" ON "Actor"("selfUserId");

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_selfUserId_fkey" FOREIGN KEY ("selfUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
