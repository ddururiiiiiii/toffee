-- CreateEnum
CREATE TYPE "IapPlatform" AS ENUM ('IOS', 'ANDROID');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "iapPlatform" "IapPlatform",
ADD COLUMN     "iapTransactionId" TEXT,
ADD COLUMN     "iapExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_iapTransactionId_key" ON "Subscription"("iapTransactionId");
