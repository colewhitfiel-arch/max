-- CreateEnum
CREATE TYPE "ClubInterestStatus" AS ENUM ('CHOSEN', 'LATER', 'SKIPPED');

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "future_interests" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "student_club_interests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "status" "ClubInterestStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_club_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_club_interests_club_id_status_idx" ON "student_club_interests"("club_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_club_interests_student_id_club_id_key" ON "student_club_interests"("student_id", "club_id");

-- AddForeignKey
ALTER TABLE "student_club_interests" ADD CONSTRAINT "student_club_interests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_club_interests" ADD CONSTRAINT "student_club_interests_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
