-- 정산 마감(2026-09-29)
-- CreateTable
CREATE TABLE "SettlementClose" (
    "month" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "SettlementClose_pkey" PRIMARY KEY ("month")
);

