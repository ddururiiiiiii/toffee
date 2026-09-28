-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mediaKey" TEXT;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "mediaKey" TEXT,
ALTER COLUMN "mediaUrl" DROP NOT NULL;

