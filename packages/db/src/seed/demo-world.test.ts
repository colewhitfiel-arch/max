/**
 * Seed на отдельной БД (`<DATABASE_URL_TEST>_seed`, чтобы не мешать интеграционным тестам api):
 * повторный запуск не плодит строк, а переезд демо-занятий (seed в другой день, как при
 * следующем деплое) не оставляет на них чужих отметок и занятий из правил.
 * Нужен PostgreSQL; пропускается без DATABASE_URL_TEST или при SKIP_DB_TESTS=1.
 */
import { DEMO_IDS, demoAttendance, materializeDemoLessons } from '@edu/contracts/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../client';
import { prepareTestDatabase } from '../testing';
import { seedDemoWorld } from './demo-world';

const baseUrl = process.env.DATABASE_URL_TEST;
const skip = process.env.SKIP_DB_TESTS === '1' || !baseUrl;
const DAY_MS = 86_400_000;

function seedDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname}_seed`;
  return parsed.toString();
}

describe.skipIf(skip)('seed демо-мира (БД)', () => {
  const url = seedDatabaseUrl(baseUrl ?? 'postgresql://localhost/skip');
  const prisma = createPrismaClient({ url });
  const now = new Date();
  const later = new Date(now.getTime() + 3 * DAY_MS);

  beforeAll(async () => {
    prepareTestDatabase({ url });
    await seedDemoWorld(prisma, now);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function tableCounts(): Promise<Record<string, number>> {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name::text AS table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    const counts: Record<string, number> = {};
    for (const { table_name: table } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM "${table}"`,
      );
      counts[table] = Number(rows[0]?.count ?? 0);
    }
    return counts;
  }

  it('повторный seed (и в другой день) не меняет число строк ни в одной таблице', async () => {
    const before = await tableCounts();
    expect(before.lessons).toBeGreaterThan(0);
    await seedDemoWorld(prisma, now);
    expect(await tableCounts()).toEqual(before);
    await seedDemoWorld(prisma, later);
    expect(await tableCounts()).toEqual(before);
    await seedDemoWorld(prisma, now);
  });

  it('переезд демо-занятий: отметки через api и занятия из правил под ними удаляются', async () => {
    const { roboticsToday } = DEMO_IDS.lessons;
    const moved = materializeDemoLessons(later).find((lesson) => lesson.id === roboticsToday);
    if (!moved) throw new Error('нет демо-занятия roboticsToday');
    const slot = { startsAt: new Date(moved.startsAt), endsAt: new Date(moved.endsAt) };
    const marked = { markedById: DEMO_IDS.teachers.maria, status: 'PRESENT' as const };

    // Преподаватель отметил сегодняшнее занятие через api → оно DONE
    const apiMark = await prisma.attendance.create({
      data: { lessonId: roboticsToday, studentId: DEMO_IDS.students.alexey, ...marked },
    });
    await prisma.lesson.update({ where: { id: roboticsToday }, data: { status: 'DONE' } });
    // Материализация уже создала занятие из правила там, куда демо-занятие переедет, и его
    // отметили; отменённое занятие другого правила в том же слоте должно остаться.
    const ruleLesson = await prisma.lesson.create({
      data: {
        groupId: DEMO_IDS.groups.roboticsA,
        ruleId: DEMO_IDS.scheduleRules.roboticsMon,
        ...slot,
      },
    });
    await prisma.attendance.create({
      data: { lessonId: ruleLesson.id, studentId: DEMO_IDS.students.dasha, ...marked },
    });
    // И занятие из правила другой группы того же преподавателя (Мария ведёт обе, Алексей
    // ходит в обе) — оно тоже уходит: преподаватель не ведёт две группы сразу.
    const otherGroupLesson = await prisma.lesson.create({
      data: {
        groupId: DEMO_IDS.groups.programmingA,
        ruleId: DEMO_IDS.scheduleRules.programmingTue,
        ...slot,
      },
    });
    const cancelled = await prisma.lesson.create({
      data: {
        groupId: DEMO_IDS.groups.roboticsA,
        ruleId: DEMO_IDS.scheduleRules.roboticsThu,
        status: 'CANCELLED',
        ...slot,
      },
    });

    try {
      await seedDemoWorld(prisma, later);

      expect(await prisma.attendance.findUnique({ where: { id: apiMark.id } })).toBeNull();
      expect(await prisma.lesson.findUnique({ where: { id: ruleLesson.id } })).toBeNull();
      expect(await prisma.lesson.findUnique({ where: { id: otherGroupLesson.id } })).toBeNull();
      expect(await prisma.lesson.findUnique({ where: { id: cancelled.id } })).not.toBeNull();
      const lesson = await prisma.lesson.findUniqueOrThrow({
        where: { id: roboticsToday },
        include: { attendance: true },
      });
      expect(lesson.status).toBe('PLANNED');
      expect(lesson.startsAt.toISOString()).toBe(moved.startsAt);
      expect(lesson.attendance).toEqual([]);
      const fixtureMarks = await prisma.attendance.count({
        where: { id: { in: demoAttendance.map((row) => row.id) } },
      });
      expect(fixtureMarks).toBe(demoAttendance.length);
    } finally {
      await prisma.lesson.deleteMany({
        where: { id: { in: [ruleLesson.id, otherGroupLesson.id, cancelled.id] } },
      });
      await seedDemoWorld(prisma, now);
    }
  });
});
