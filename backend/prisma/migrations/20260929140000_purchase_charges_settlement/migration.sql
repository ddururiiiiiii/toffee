-- 정산용 결제 기록(2026-09-29). 기존 구매의 결제 기록은 서버의 ChargeLedgerService.fillMissing(시작 시·매시간)이 채움
-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('SANDBOX', 'APPLE', 'GOOGLE');

-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "revenueSharePercent" INTEGER;

-- CreateTable
CREATE TABLE "PurchaseCharge" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT,
    "actorId" TEXT,
    "bundleId" TEXT,
    "productName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "chargedAt" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "source" "ChargeSource" NOT NULL,
    "storeTransactionId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeAllocation" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "agencyId" TEXT,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "ChargeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCharge_storeTransactionId_key" ON "PurchaseCharge"("storeTransactionId");

-- CreateIndex
CREATE INDEX "PurchaseCharge_chargedAt_idx" ON "PurchaseCharge"("chargedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCharge_purchaseId_chargedAt_key" ON "PurchaseCharge"("purchaseId", "chargedAt");

-- CreateIndex
CREATE INDEX "ChargeAllocation_chargeId_idx" ON "ChargeAllocation"("chargeId");

-- CreateIndex
CREATE INDEX "ChargeAllocation_agencyId_idx" ON "ChargeAllocation"("agencyId");

-- CreateIndex
CREATE INDEX "ChargeAllocation_actorId_idx" ON "ChargeAllocation"("actorId");

-- AddForeignKey
ALTER TABLE "PurchaseCharge" ADD CONSTRAINT "PurchaseCharge_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PurchaseCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

