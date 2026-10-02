-- CreateEnum
CREATE TYPE "ArtistGender" AS ENUM ('FEMALE', 'MALE');

-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "gender" "ArtistGender";
