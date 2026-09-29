-- 정산 지급 기록(2026-09-29)
-- CreateTable
CREATE TABLE "SettlementPayout" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "agencyId" TEXT,
    "actorId" TEXT,
    "payeeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementPayout_month_payeeKey_key" ON "SettlementPayout"("month", "payeeKey");

-- AddForeignKey
ALTER TABLE "SettlementPayout" ADD CONSTRAINT "SettlementPayout_month_fkey" FOREIGN KEY ("month") REFERENCES "SettlementClose"("month") ON DELETE RESTRICT ON UPDATE CASCADE;
