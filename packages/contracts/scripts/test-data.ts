/**
 * Тестовые данные в JSON для воспроизводимой проверки (формат сдачи хакатона, п. 4):
 * `pnpm --filter @edu/contracts test-data` → `test-data/demo-world.json` в корне монорепо.
 * Источник — те же фикстуры, из которых seed строит демо-мир (`packages/contracts/src/fixtures`),
 * поэтому файл всегда совпадает с тем, что лежит в базе стенда и Docker после seed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  demoAssignments,
  demoBlocks,
  demoClubs,
  demoCourse,
  demoEnrollments,
  demoGroups,
  demoLoginUsers,
  demoModules,
  demoParentLinks,
  demoScheduleRules,
  demoSchool,
  demoStudents,
  demoTeachers,
  demoUsers,
  materializeDemoLessons,
} from '../src/fixtures/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const now = new Date();

const data = {
  $comment:
    'Демо-мир для проверки. Вход без пароля: POST /api/v1/auth/dev {"maxUserId","roles"} или экран /auth в браузере. ' +
    'Занятия (lessons) привязаны к дате генерации; seed на стенде пересоздаёт их относительно текущего дня.',
  generatedAt: now.toISOString(),
  testAccounts: demoLoginUsers,
  codes: {
    schoolInviteCode: 'SCHOOL1',
    childLinkCodes: Object.fromEntries(
      demoStudents.map((s) => [
        Object.values(demoUsers).find((u) => u.id === s.userId)?.maxUserId ?? s.userId,
        s.linkCode,
      ]),
    ),
  },
  school: demoSchool,
  users: Object.values(demoUsers),
  teachers: demoTeachers,
  students: demoStudents,
  parentLinks: demoParentLinks,
  clubs: demoClubs,
  groups: demoGroups,
  enrollments: demoEnrollments,
  scheduleRules: demoScheduleRules,
  lessons: materializeDemoLessons(now),
  course: demoCourse,
  modules: demoModules,
  blocks: demoBlocks,
  assignments: demoAssignments,
};

const out = path.resolve(__dirname, '../../../test-data/demo-world.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(
  `test-data: ${data.users.length} пользователей, ${data.clubs.length} кружков, ${data.groups.length} групп, ` +
    `${data.lessons.length} занятий, ${data.assignments.length} заданий → ${path.relative(process.cwd(), out)}`,
);
