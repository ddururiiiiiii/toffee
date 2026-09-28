-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByAdmin" BOOLEAN NOT NULL DEFAULT false;

