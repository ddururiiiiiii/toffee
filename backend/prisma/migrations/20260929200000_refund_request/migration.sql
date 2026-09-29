-- 팬 환불 요청(스타 미발송 환불, 2026-09-29)
-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('REFUNDED', 'STORE_GUIDED');

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "ChargeSource" NOT NULL,
    "status" "RefundRequestStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefundRequest_userId_idx" ON "RefundRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_chargeId_reason_key" ON "RefundRequest"("chargeId", "reason");

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PurchaseCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

