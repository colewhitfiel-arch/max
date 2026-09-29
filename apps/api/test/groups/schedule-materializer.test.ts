/**
 * Интеграция: материализация расписания (job `schedule.materialize`, docs/04) на тестовой БД.
 * «Сейчас» — 2031 год, чтобы не пересекаться с демо-занятиями; свои группы теста и все занятия
 * из правил, созданные тестом (в том числе демо-групп), после удаляются. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ScheduleMaterializerService } from '../../src/modules/groups/schedule-materializer.service';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('материализация расписания (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let materializer: ScheduleMaterializerService;
  const run = Date.now();
  const now = new Date('2031-03-03T06:00:00.000Z'); // понедельник, 09:00 МСК
  const windowStart = new Date('2031-01-01T00:00:00.000Z');
  let groupId = '';
  let otherGroupId = '';
  let inactiveGroupId = '';
  let mondayRule = '';
  let wednesdayRule = '';

  const lessonsOf = (where: { groupId?: string; ruleId?: string }) =>
    prisma.lesson.findMany({ where, orderBy: { startsAt: 'asc' } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    materializer = app.get(ScheduleMaterializerService);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/dev')
      .send({ maxUserId: `max-teacher-schedule-${run}`, roles: ['TEACHER'] })
      .expect(200);
    const teacherId = (login.body as { me: { teacher: { id: string } } }).me.teacher.id;

    const group = await prisma.group.create({
      data: { clubId: DEMO_IDS.clubs.robotics, teacherId, title: `Расписание ${run}` },
    });
    groupId = group.id;
    // Вторая группа того же преподавателя: он не ведёт две группы одновременно.
    otherGroupId = (
      await prisma.group.create({
        data: { clubId: DEMO_IDS.clubs.programming, teacherId, title: `Вторая ${run}` },
      })
    ).id;
    const inactive = await prisma.group.create({
      data: {
        clubId: DEMO_IDS.clubs.robotics,
        teacherId,
        title: `Закрыта ${run}`,
        isActive: false,
      },
    });
    inactiveGroupId = inactive.id;

    const validFrom = new Date('2031-01-01T00:00:00.000Z');
    mondayRule = (
      await prisma.scheduleRule.create({
        data: { groupId, weekday: 1, startTime: '10:00', endTime: '11:00', validFrom },
      })
    ).id;
    wednesdayRule = (
      await prisma.scheduleRule.create({
        data: {
          groupId,
          weekday: 3,
          startTime: '12:00',
          endTime: '13:00',
          room: 'Каб. 7',
          validFrom,
          validTo: new Date('2031-03-12T00:00:00.000Z'),
        },
      })
    ).id;
    await prisma.scheduleRule.create({
      data: {
        groupId: inactiveGroupId,
        weekday: 1,
        startTime: '10:00',
        endTime: '11:00',
        validFrom,
      },
    });

    // Разовое занятие ровно в слот правила (как плавающие демо-занятия seed'а) и отменённое
    // занятие из правила: ни то ни другое не должно дать второго занятия в то же время.
    await prisma.lesson.create({
      data: {
        groupId,
        startsAt: new Date('2031-03-03T07:00:00.000Z'),
        endsAt: new Date('2031-03-03T08:00:00.000Z'),
        topic: 'Разовое',
      },
    });
    await prisma.lesson.create({
      data: {
        groupId,
        ruleId: mondayRule,
        startsAt: new Date('2031-03-10T07:00:00.000Z'),
        endsAt: new Date('2031-03-10T08:00:00.000Z'),
        status: 'CANCELLED',
        cancelReason: 'Каникулы',
      },
    });
    // Занятие другой группы того же преподавателя, задевающее слот 17.03 (10:30–11:30 МСК), —
    // слот пропускается; занятие закрытой группы в слоте 24.03 слот не занимает.
    await prisma.lesson.create({
      data: {
        groupId: otherGroupId,
        startsAt: new Date('2031-03-17T07:30:00.000Z'),
        endsAt: new Date('2031-03-17T08:30:00.000Z'),
        topic: 'Другая группа',
      },
    });
    await prisma.lesson.create({
      data: {
        groupId: inactiveGroupId,
        startsAt: new Date('2031-03-24T07:00:00.000Z'),
        endsAt: new Date('2031-03-24T08:00:00.000Z'),
        topic: 'Закрытая группа',
      },
    });
  });

  afterAll(async () => {
    const demoRules = Object.values(DEMO_IDS.scheduleRules);
    await prisma.lesson.deleteMany({
      where: {
        OR: [
          { groupId: { in: [groupId, otherGroupId, inactiveGroupId] } },
          { ruleId: { in: demoRules }, startsAt: { gte: windowStart } },
        ],
      },
    });
    await prisma.scheduleRule.deleteMany({
      where: { groupId: { in: [groupId, inactiveGroupId] } },
    });
    await prisma.group.deleteMany({
      where: { id: { in: [groupId, otherGroupId, inactiveGroupId] } },
    });
    await app.close();
  });

  it('создаёт занятия из правил на 8 недель вперёд по часам школы', async () => {
    const { created } = await materializer.materialize(now);
    expect(created).toBeGreaterThan(0);

    // Понедельники 03.03 … 21.04 в 10:00 МСК = 07:00 UTC; 03.03 занят разовым, 10.03 отменён,
    // 17.03 преподаватель ведёт другую группу.
    const monday = await lessonsOf({ ruleId: mondayRule });
    expect(monday.map((lesson) => lesson.startsAt.toISOString())).toEqual(
      ['03-10', '03-24', '03-31', '04-07', '04-14', '04-21'].map(
        (day) => `2031-${day}T07:00:00.000Z`,
      ),
    );
    expect(monday.filter((lesson) => lesson.status === 'CANCELLED')).toHaveLength(1);
    expect(monday.every((lesson) => lesson.groupId === groupId)).toBe(true);
    expect(
      monday.every((lesson) => lesson.endsAt.getTime() - lesson.startsAt.getTime() === 3_600_000),
    ).toBe(true);

    // Среда — только до validTo (12.03 включительно), с кабинетом правила
    const wednesday = await lessonsOf({ ruleId: wednesdayRule });
    expect(wednesday.map((lesson) => lesson.startsAt.toISOString())).toEqual([
      '2031-03-05T09:00:00.000Z',
      '2031-03-12T09:00:00.000Z',
    ]);
    expect(wednesday.every((lesson) => lesson.room === 'Каб. 7')).toBe(true);

    // В слоте разового занятия второго не появилось; у неактивной группы занятий нет
    const firstMonday = await prisma.lesson.findMany({
      where: { groupId, startsAt: new Date('2031-03-03T07:00:00.000Z') },
    });
    expect(firstMonday).toHaveLength(1);
    expect(firstMonday[0]?.ruleId).toBeNull();
    expect((await lessonsOf({ groupId: inactiveGroupId })).map((lesson) => lesson.ruleId)).toEqual([
      null,
    ]);
  });

  it('повторный запуск идемпотентен', async () => {
    const before = await prisma.lesson.count({ where: { startsAt: { gte: windowStart } } });
    expect(await materializer.materialize(now)).toEqual({ created: 0 });
    expect(await prisma.lesson.count({ where: { startsAt: { gte: windowStart } } })).toBe(before);
  });
});
