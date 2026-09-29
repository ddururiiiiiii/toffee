-- 스타 장기 미발송 알림 기록(2026-09-29)
-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "idleReminderFor" TIMESTAMP(3),
ADD COLUMN     "idleReminderStage" INTEGER;

