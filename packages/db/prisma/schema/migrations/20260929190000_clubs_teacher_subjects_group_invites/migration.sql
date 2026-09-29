-- Кружки: ровно 8 направлений со своими иконками (docs/04 §4.1). Старые категории переносятся:
-- LANGUAGES — по названию (китайский → CHINESE, иначе ENGLISH); кружки без своего направления
-- (MATH, MUSIC, SPORT, SCIENCE, OTHER) — по названию, иначе в ENTREPRENEURSHIP («проектная»
-- иконка, которую они и так показывали).
BEGIN;
CREATE TYPE "ClubCategory_new" AS ENUM ('ROBOTICS', 'CHINESE', 'ENGLISH', 'PROGRAMMING', 'ENTREPRENEURSHIP', 'ART', 'PUBLIC_SPEAKING', 'CHESS');
ALTER TABLE "clubs" ALTER COLUMN "category" TYPE "ClubCategory_new" USING (
  CASE
    WHEN "category"::text IN ('ROBOTICS', 'PROGRAMMING', 'ART', 'CHESS') THEN "category"::text
    WHEN lower("title") LIKE '%китай%' THEN 'CHINESE'
    WHEN lower("title") LIKE '%англ%' OR "category"::text = 'LANGUAGES' THEN 'ENGLISH'
    WHEN lower("title") LIKE '%оратор%' OR lower("title") LIKE '%публичн%' THEN 'PUBLIC_SPEAKING'
    ELSE 'ENTREPRENEURSHIP'
  END
)::"ClubCategory_new";
ALTER TYPE "ClubCategory" RENAME TO "ClubCategory_old";
ALTER TYPE "ClubCategory_new" RENAME TO "ClubCategory";
DROP TYPE "public"."ClubCategory_old";
COMMIT;

-- Какие кружки ведёт преподаватель (выбирает сам)
ALTER TABLE "teacher_profiles" ADD COLUMN "subjects" "ClubCategory"[] DEFAULT ARRAY[]::"ClubCategory"[];

-- Многоразовая ссылка-приглашение в группу
ALTER TABLE "groups" ADD COLUMN "invite_token" TEXT;
CREATE UNIQUE INDEX "groups_invite_token_key" ON "groups"("invite_token");
