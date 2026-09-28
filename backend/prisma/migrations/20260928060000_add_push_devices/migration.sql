-- 계정당 푸시 토큰 1개(User.fcmToken) → 기기별 여러 개(PushDevice). 기존 토큰은 옮긴 뒤 컬럼 삭제.
-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 토큰 옮기기(같은 토큰이 여러 계정에 있으면 하나만)
INSERT INTO "PushDevice" ("id", "userId", "token", "updatedAt")
SELECT DISTINCT ON ("fcmToken") gen_random_uuid()::text, "id", "fcmToken", CURRENT_TIMESTAMP
FROM "User"
WHERE "fcmToken" IS NOT NULL
ORDER BY "fcmToken", "updatedAt" DESC;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "fcmToken";
