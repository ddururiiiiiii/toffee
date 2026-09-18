-- AlterEnum
ALTER TYPE "MessageMediaType" ADD VALUE 'VIDEO';

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "mediaType" "MessageMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "fanUserId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_fanUserId_key" ON "StoryView"("storyId", "fanUserId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_fanUserId_fkey" FOREIGN KEY ("fanUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
