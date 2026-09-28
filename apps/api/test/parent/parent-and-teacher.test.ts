/**
 * Интеграция: экраны родителя и преподавателя на настоящем API — дети и приглашения,
 * оплаты и кошельки, дашборды (docs/07 F9–F10, F13–F18). Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

describe.skipIf(!hasTestDatabase)('родитель и преподаватель (integration)', () => {
  let app: INestApplication;
  let parent = '';
  let teacher = '';
  let student = '';
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());

  const loginAs = async (maxUserId: string, role: 'TEACHER' | 'STUDENT' | 'PARENT') => {
    const res = await http()
      .post(`${base}/auth/dev`)
      .send({ maxUserId, roles: [role] })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    parent = await loginAs('max-parent-1', 'PARENT');
    teacher = await loginAs('max-teacher-1', 'TEACHER');
    student = await loginAs('max-student-1', 'STUDENT');
  });

  afterAll(async () => {
    await app.close();
  });

  it('дети родителя приходят со статусом связи и школой', async () => {
    const res = await http()
      .get(`${base}/parent/children`)
      .set('Authorization', `Bearer ${parent}`)
      .expect(200);
    const child = res.body.items.find(
      (item: { student: { id: string } }) => item.student.id === DEMO_IDS.students.alexey,
    );
    expect(child.linkStatus).toBe('ACTIVE');
    expect(child.school).not.toBeNull();
  });

  it('чужой ребёнок — 403', async () => {
    const other = await loginAs('max-parent-probe', 'PARENT');
    const res = await http()
      .get(`${base}/parent/children/${DEMO_IDS.students.alexey}/home`)
      .set('Authorization', `Bearer ${other}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('приглашение по ссылке: ученик видит его и принимает', async () => {
    // Новый родитель на каждый прогон: тестовая БД не сбрасывается, а уже привязанного ребёнка
    // повторное приглашение того же родителя не принимает (409, docs/07 F14).
    const invitingParent = await loginAs(`max-parent-invite-${Date.now()}`, 'PARENT');
    const invite = await http()
      .post(`${base}/parent/children/invites`)
      .set('Authorization', `Bearer ${invitingParent}`)
      .send()
      .expect(200);
    expect(invite.body.url).toContain(invite.body.token);

    const seen = await http()
      .get(`${base}/student/parent-invites/${invite.body.token}`)
      .set('Authorization', `Bearer ${student}`)
      .expect(200);
    expect(seen.body.status).toBe('PENDING');

    const accepted = await http()
      .post(`${base}/student/parent-invites/${invite.body.token}/accept`)
      .set('Authorization', `Bearer ${student}`)
      .send()
      .expect(200);
    expect(accepted.body.linkStatus).toBe('ACTIVE');

    // Ссылка одноразовая: второй ученик по ней пройти не может.
    const otherStudent = await loginAs('max-student-2', 'STUDENT');
    const conflict = await http()
      .post(`${base}/student/parent-invites/${invite.body.token}/accept`)
      .set('Authorization', `Bearer ${otherStudent}`)
      .send()
      .expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
  });

  it('привязка по коду ученика делает связь активной', async () => {
    const code = await http()
      .post(`${base}/student/link-code/rotate`)
      .set('Authorization', `Bearer ${student}`)
      .send()
      .expect(200);
    const linked = await http()
      .post(`${base}/parent/children/link`)
      .set('Authorization', `Bearer ${parent}`)
      .send({ code: code.body.linkCode })
      .expect(200);
    expect(linked.body.student.id).toBe(DEMO_IDS.students.alexey);
    expect(linked.body.linkStatus).toBe('ACTIVE');
  });

  it('оплата кружка закрывается сразу (fake-провайдер) и попадает в кошелёк преподавателя', async () => {
    const before = await http()
      .get(`${base}/teacher/wallet`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);

    const created = await http()
      .post(`${base}/parent/children/${DEMO_IDS.students.alexey}/payments`)
      .set('Authorization', `Bearer ${parent}`)
      .set('Idempotency-Key', `test-${Date.now()}`)
      .send({ enrollmentId: DEMO_IDS.enrollments.alexeyProgramming, periodsCount: 1 })
      .expect(200);
    expect(created.body.confirmationUrl).toMatch(/^https?:\/\//);

    const payment = await http()
      .get(`${base}/parent/payments/${created.body.paymentId}`)
      .set('Authorization', `Bearer ${parent}`)
      .expect(200);
    expect(payment.body.status).toBe('SUCCEEDED');
    expect(payment.body.paidAt).not.toBeNull();

    const after = await http()
      .get(`${base}/teacher/wallet`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(after.body.balance.amountKopecks).toBe(
      before.body.balance.amountKopecks + created.body.amount.amountKopecks,
    );
  });

  it('повтор оплаты с тем же Idempotency-Key не создаёт второй платёж', async () => {
    const key = `test-repeat-${Date.now()}`;
    const send = () =>
      http()
        .post(`${base}/parent/children/${DEMO_IDS.students.alexey}/payments`)
        .set('Authorization', `Bearer ${parent}`)
        .set('Idempotency-Key', key)
        .send({ enrollmentId: DEMO_IDS.enrollments.alexeyRobotics, periodsCount: 1 })
        .expect(200);
    const first = await send();
    const second = await send();
    expect(second.body.paymentId).toBe(first.body.paymentId);
  });

  it('вывод больше баланса — BUSINESS_RULE', async () => {
    const wallet = await http()
      .get(`${base}/teacher/wallet`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    const res = await http()
      .post(`${base}/teacher/wallet/withdraw`)
      .set('Authorization', `Bearer ${teacher}`)
      .set('Idempotency-Key', `test-withdraw-${Date.now()}`)
      .send({ amountKopecks: wallet.body.balance.amountKopecks + 100_00 })
      .expect(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('аналитика ребёнка: неделя, динамика и сетки заданий', async () => {
    const res = await http()
      .get(`${base}/parent/children/${DEMO_IDS.students.alexey}/analytics`)
      .set('Authorization', `Bearer ${parent}`)
      .expect(200);
    expect(res.body.week).toHaveLength(7);
    expect(res.body.weekly.length).toBeGreaterThan(0);
    const totals = res.body.clubHomework.reduce(
      (sum: number, item: { tasks: unknown[] }) => sum + item.tasks.length,
      0,
    );
    const counts = res.body.homework;
    expect(counts.correct + counts.wrong + counts.upcoming).toBe(totals);
  });

  it('главная преподавателя считает группы и «проверить»', async () => {
    const res = await http()
      .get(`${base}/teacher/home`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(res.body.groups.length).toBeGreaterThan(0);
    expect(res.body.stats.groupsCount).toBe(res.body.groups.length);
    expect(Array.isArray(res.body.toGrade)).toBe(true);
  });

  it('карточка ученика преподавателя показывает только его группы', async () => {
    const res = await http()
      .get(`${base}/teacher/students/${DEMO_IDS.students.alexey}`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    const ids = res.body.groups.map((group: { id: string }) => group.id);
    expect(ids).toContain(DEMO_IDS.groups.roboticsA);
    expect(res.body.week).toHaveLength(7);
  });

  it('успеваемость групп: homeworkCorrect не больше homeworkDone', async () => {
    const res = await http()
      .get(`${base}/teacher/performance?period=month`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    for (const group of res.body.groups) {
      expect(group.homeworkCorrect).toBeLessThanOrEqual(group.homeworkDone);
    }
  });

  it('обращение в поддержку создаётся и видно только автору', async () => {
    const created = await http()
      .post(`${base}/support/tickets`)
      .set('Authorization', `Bearer ${parent}`)
      .send({ subject: 'Не приходит уведомление', message: 'Проверьте, пожалуйста' })
      .expect(200);
    const mine = await http()
      .get(`${base}/support/tickets`)
      .set('Authorization', `Bearer ${parent}`)
      .expect(200);
    expect(mine.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

    const foreign = await http()
      .get(`${base}/support/tickets`)
      .set('Authorization', `Bearer ${teacher}`)
      .expect(200);
    expect(foreign.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(
      false,
    );
  });
});
