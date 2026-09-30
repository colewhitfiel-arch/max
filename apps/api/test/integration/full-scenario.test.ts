/**
 * Полный пользовательский сценарий новых аккаунтов (docs/07 F21): регистрация по логину →
 * роль → группа и ссылка-приглашение → конспект → курс → публикация → ученик проходит курс,
 * тест проверяется сразу → прогресс у преподавателя. Хранилище — Postgres (как на стенде
 * Vercel), ИИ — mock. Нужна тестовая БД (pnpm db:up, DATABASE_URL_TEST).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { InlineJobQueue } from '../../src/common/queue/inline-job-queue';
import { JOB_QUEUE } from '../../src/common/queue/job-queue';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

const KONSPEKT = [
  '# Датчики Arduino',
  '',
  'Ультразвуковой датчик HC-SR04 измеряет расстояние по времени между посылкой и приёмом звукового импульса.',
  '',
  'Датчик подключается четырьмя проводами: питание 5 В, земля, Trig и Echo к цифровым пинам платы.',
  '',
  'Функция pulseIn измеряет длительность импульса на пине Echo в микросекундах.',
  '',
  'Расстояние в сантиметрах равно длительности импульса, делённой на 58.',
].join('\n');

describe.skipIf(!hasTestDatabase)(
  'полный сценарий: регистрация → конспект → курс (integration)',
  () => {
    let app: INestApplication;
    const base = '/api/v1';
    const run = Date.now().toString(36);
    const http = () => request(app.getHttpServer());
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const userIds: string[] = [];

    let teacher = '';
    let student = '';
    let groupId = '';
    let inviteToken = '';
    let courseId = '';

    beforeAll(async () => {
      app = await createTestApp({ STORAGE_DRIVER: 'postgres' });
    });

    afterAll(async () => {
      await (app.get(JOB_QUEUE) as InlineJobQueue).drain();
      const prisma = app.get(PrismaService);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { teacher: true, student: true, files: true },
      });
      const teacherIds = users.flatMap((user) => (user.teacher ? [user.teacher.id] : []));
      const studentIds = users.flatMap((user) => (user.student ? [user.student.id] : []));
      const groups = await prisma.group.findMany({
        where: { teacherId: { in: teacherIds } },
        select: { id: true, clubId: true },
      });
      const groupIds = groups.map((group) => group.id);
      const keys = users.flatMap((user) =>
        user.files.flatMap((file) => [file.storageKey, `${file.storageKey}.txt`]),
      );
      await prisma.assignment.deleteMany({ where: { groupId: { in: groupIds } } });
      await prisma.course.deleteMany({ where: { teacherId: { in: teacherIds } } });
      await prisma.courseGenerationJob.deleteMany({ where: { teacherId: { in: teacherIds } } });
      await prisma.enrollment.deleteMany({ where: { groupId: { in: groupIds } } });
      await prisma.teacherWalletTransaction.deleteMany({
        where: { teacherId: { in: teacherIds } },
      });
      await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
      await prisma.club.deleteMany({ where: { id: { in: groups.map((group) => group.clubId) } } });
      await prisma.blockProgress.deleteMany({ where: { studentId: { in: studentIds } } });
      await prisma.file.deleteMany({ where: { ownerUserId: { in: userIds } } });
      await prisma.storedObject.deleteMany({ where: { key: { in: keys } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await app.close();
    });

    const register = async (login: string, firstName: string) => {
      const res = await http()
        .post(`${base}/auth/register`)
        .send({ login, password: 'secret-pass-1', firstName })
        .expect(200);
      userIds.push(res.body.me.user.id);
      return res.body as { accessToken: string; me: { needsRoleSetup: boolean; login: string } };
    };

    it('регистрация: новый аккаунт без ролей, логин без учёта регистра, занятый логин — 409', async () => {
      const created = await register(`Teacher.${run}`, 'Мария');
      expect(created.me).toMatchObject({ needsRoleSetup: true, login: `teacher.${run}` });
      teacher = created.accessToken;

      const taken = await http()
        .post(`${base}/auth/register`)
        .send({ login: `TEACHER.${run}`, password: 'another-pass', firstName: 'Кто-то' })
        .expect(409);
      expect(taken.body.error.code).toBe('CONFLICT');

      await http()
        .post(`${base}/auth/register`)
        .send({ login: 'а б', password: 'short', firstName: '' })
        .expect(400);
    });

    it('вход по паролю: верный — сессия, неверный и неизвестный логин — одинаковый 401', async () => {
      const ok = await http()
        .post(`${base}/auth/login`)
        .send({ login: `teacher.${run}`, password: 'secret-pass-1' })
        .expect(200);
      expect(ok.body.me.user.firstName).toBe('Мария');

      const wrong = await http()
        .post(`${base}/auth/login`)
        .send({ login: `teacher.${run}`, password: 'wrong-pass-1' })
        .expect(401);
      const unknown = await http()
        .post(`${base}/auth/login`)
        .send({ login: `nobody.${run}`, password: 'secret-pass-1' })
        .expect(401);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('преподаватель: роль без кода школы (не production), кружки, группа со ссылкой', async () => {
      const role = await http()
        .post(`${base}/auth/roles`)
        .set(auth(teacher))
        .send({ role: 'TEACHER' })
        .expect(200);
      teacher = role.body.accessToken;
      expect(role.body.me.teacher.subjects).toEqual([]);

      await http()
        .patch(`${base}/me/teacher`)
        .set(auth(teacher))
        .send({ subjects: ['ROBOTICS'] })
        .expect(200);

      const created = await http()
        .post(`${base}/teacher/groups`)
        .set(auth(teacher))
        .send({
          category: 'ROBOTICS',
          title: `Arduino ${run}`,
          price: { amountKopecks: 0, currency: 'RUB' },
        })
        .expect(200);
      groupId = created.body.group.id;
      inviteToken = created.body.invite.token;
    });

    it('ученик: регистрация → роль → вступление в группу по ссылке', async () => {
      const created = await register(`student.${run}`, 'Даня');
      const role = await http()
        .post(`${base}/auth/roles`)
        .set(auth(created.accessToken))
        .send({ role: 'STUDENT' })
        .expect(200);
      student = role.body.accessToken;
      expect(role.body.me.student.onboardingCompleted).toBe(false);

      await http()
        .post(`${base}/student/group-invites/${inviteToken}/join`)
        .set(auth(student))
        .expect(200);
    });

    it('конспект: загрузка в хранилище Postgres → генерация → публикация курса', async () => {
      const bytes = Buffer.from(KONSPEKT, 'utf8');
      const upload = await http()
        .post(`${base}/files/upload-url`)
        .set(auth(teacher))
        .send({
          fileName: 'конспект.md',
          mime: 'text/markdown',
          sizeBytes: bytes.length,
          purpose: 'MATERIAL',
        })
        .expect(200);
      await http()
        .put(new URL(upload.body.uploadUrl).pathname)
        .set('Content-Type', 'text/markdown')
        .send(KONSPEKT)
        .expect(204);
      await http()
        .post(`${base}/files/${upload.body.fileId}/confirm`)
        .set(auth(teacher))
        .expect(200);

      const job = await http()
        .post(`${base}/teacher/course-builder/jobs`)
        .set(auth(teacher))
        .send({ groupId, materialIds: [upload.body.fileId], targetTitle: `Датчики ${run}` })
        .expect(200);
      await (app.get(JOB_QUEUE) as InlineJobQueue).drain();
      const ready = await http()
        .get(`${base}/teacher/course-builder/jobs/${job.body.id}`)
        .set(auth(teacher))
        .expect(200);
      expect(ready.body.stage).toBe('READY');

      const accepted = await http()
        .post(`${base}/teacher/course-builder/jobs/${job.body.id}/accept`)
        .set(auth(teacher))
        .expect(200);
      courseId = accepted.body.courseId;

      // Черновик ученик не видит.
      const before = await http().get(`${base}/student/courses`).set(auth(student)).expect(200);
      expect(before.body.items.map((c: { id: string }) => c.id)).not.toContain(courseId);

      const published = await http()
        .post(`${base}/teacher/courses/${courseId}/publish`)
        .set(auth(teacher))
        .send({ assignments: [] })
        .expect(200);
      expect(published.body.status).toBe('PUBLISHED');
    });

    it('ученик проходит курс: теория засчитывается, тест проверяется сразу с разбором', async () => {
      const list = await http().get(`${base}/student/courses`).set(auth(student)).expect(200);
      const card = list.body.items.find((c: { id: string }) => c.id === courseId);
      expect(card.progress.percent).toBe(0);

      const course = await http()
        .get(`${base}/student/courses/${courseId}`)
        .set(auth(student))
        .expect(200);
      const blocks = course.body.modules.flatMap(
        (module: { blocks: Array<{ id: string; type: string }> }) => module.blocks,
      );
      const text = blocks.find((block: { type: string }) => block.type === 'TEXT');
      const quiz = blocks.find((block: { type: string }) => block.type === 'QUIZ');
      expect(text).toBeDefined();
      expect(quiz).toBeDefined();

      await http().post(`${base}/student/blocks/${text.id}/open`).set(auth(student)).expect(200);
      const done = await http()
        .post(`${base}/student/blocks/${text.id}/complete`)
        .set(auth(student))
        .send({})
        .expect(200);
      expect(done.body.courseProgress.completedBlocks).toBe(1);

      const quizBlock = await http()
        .get(`${base}/student/blocks/${quiz.id}`)
        .set(auth(student))
        .expect(200);
      expect(quizBlock.body.assignment).not.toBeNull();
      expect(quizBlock.body.quizReview).toBeUndefined();
      // Отвечаем на всё первым вариантом: часть ответов может оказаться неверной.
      const answers = Object.fromEntries(
        quizBlock.body.content.questions.map(
          (q: { id: string; options: Array<{ id: string }> }) => [q.id, [q.options[0]!.id]],
        ),
      );
      await http()
        .post(`${base}/student/assignments/${quizBlock.body.assignment.id}/submit`)
        .set(auth(student))
        .set('Idempotency-Key', `quiz-${run}`)
        .send({ answers })
        .expect(200);

      const after = await http()
        .get(`${base}/student/blocks/${quiz.id}`)
        .set(auth(student))
        .expect(200);
      expect(after.body.progress.status).toBe('COMPLETED');
      const review = after.body.quizReview;
      expect(review.questions).toHaveLength(quizBlock.body.content.questions.length);
      for (const question of review.questions) {
        // Правильный вариант раскрывается только у верно отвеченного вопроса.
        expect(question.correctOptionIds !== undefined).toBe(question.correct);
      }

      const assignment = await http()
        .get(`${base}/student/assignments/${quizBlock.body.assignment.id}`)
        .set(auth(student))
        .expect(200);
      expect(assignment.body.submission.status).toBe('GRADED');
      expect(assignment.body.submission.score).toBe(review.score);
    });

    it('преподаватель видит прогресс ученика по курсу', async () => {
      const progress = await http()
        .get(`${base}/teacher/courses/${courseId}/progress`)
        .set(auth(teacher))
        .expect(200);
      expect(progress.body.students).toHaveLength(1);
      expect(progress.body.students[0].completedBlocks).toBe(2);
      expect(progress.body.students[0].percent).toBeGreaterThan(0);
    });
  },
);
