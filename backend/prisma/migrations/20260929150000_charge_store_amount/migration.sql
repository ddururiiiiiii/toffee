-- 스토어 실제 청구 금액·통화(대조용, 2026-09-29)
-- AlterTable
ALTER TABLE "PurchaseCharge" ADD COLUMN     "storeAmountMilli" INTEGER,
ADD COLUMN     "storeCurrency" TEXT;
