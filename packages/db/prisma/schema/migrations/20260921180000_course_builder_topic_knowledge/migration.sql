-- course-builder: режим «по теме без конспекта» и база знаний (атомы/узлы/план)
ALTER TABLE "course_generation_jobs" ADD COLUMN "source_kind" TEXT NOT NULL DEFAULT 'MATERIALS';
ALTER TABLE "course_generation_jobs" ADD COLUMN "topic" TEXT;
ALTER TABLE "course_generation_jobs" ADD COLUMN "knowledge" JSONB;
