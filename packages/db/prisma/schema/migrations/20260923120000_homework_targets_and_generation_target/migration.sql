-- Адресаты задания внутри группы: пустой массив — всей группе (поведение существующих заданий).
-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "student_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- Задача генерации: целый курс или одно ДЗ, и в какой курс класть результат.
-- AlterTable
ALTER TABLE "course_generation_jobs" ADD COLUMN     "due_at" TIMESTAMPTZ,
ADD COLUMN     "student_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "target" TEXT NOT NULL DEFAULT 'COURSE',
ADD COLUMN     "target_course_id" UUID;

-- CreateIndex
CREATE INDEX "course_generation_jobs_target_course_id_idx" ON "course_generation_jobs"("target_course_id");
