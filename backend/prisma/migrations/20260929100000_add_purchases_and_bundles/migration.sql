-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "storeProductId" TEXT;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "bundleId" TEXT,
    "priceCents" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "iapPlatform" "IapPlatform",
    "iapTransactionId" TEXT,
    "iapExpiresAt" TIMESTAMP(3),

CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "storeProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleActor" (
    "bundleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,

CONSTRAINT "BundleActor_pkey" PRIMARY KEY ("bundleId","actorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_iapTransactionId_key" ON "Purchase"("iapTransactionId");

-- CreateIndex
CREATE INDEX "Purchase_userId_cancelledAt_idx" ON "Purchase"("userId", "cancelledAt");

-- CreateIndex
CREATE INDEX "Purchase_bundleId_idx" ON "Purchase"("bundleId");

-- CreateIndex
CREATE INDEX "Purchase_actorId_idx" ON "Purchase"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_storeProductId_key" ON "Bundle"("storeProductId");

-- CreateIndex
CREATE INDEX "BundleActor_actorId_idx" ON "BundleActor"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Actor_storeProductId_key" ON "Actor"("storeProductId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleActor" ADD CONSTRAINT "BundleActor_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleActor" ADD CONSTRAINT "BundleActor_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 구매는 배우 개인(actorId) 또는 묶음(bundleId) 둘 중 정확히 하나(Prisma 스키마로는 표현 못 해서 DB 제약으로)
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_target_check" CHECK (("actorId" IS NULL) <> ("bundleId" IS NULL));

-- 기존 구독(사람×배우)을 구매 기록으로 옮김 — 한 줄당 배우 개인 구매 하나. 결제 정보(iap*)도 같이 옮기고,
-- 구매 시점 가격은 당시 배우 월 가격으로 채움(정확한 과거 가격은 SubscriptionEvent.priceCents에 있음)
INSERT INTO "Purchase" ("id", "userId", "actorId", "priceCents", "startedAt", "cancelledAt", "iapPlatform", "iapTransactionId", "iapExpiresAt")
SELECT gen_random_uuid()::text, s."userId", s."actorId", a."monthlyPriceCents", s."startedAt", s."cancelledAt", s."iapPlatform", s."iapTransactionId", s."iapExpiresAt"
FROM "Subscription" s JOIN "Actor" a ON a."id" = s."actorId";

-- DropIndex
DROP INDEX "Subscription_iapTransactionId_key";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "iapExpiresAt",
DROP COLUMN "iapPlatform",
DROP COLUMN "iapTransactionId";
