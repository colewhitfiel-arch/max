/**
 * Интеграция тьютора родителя (F15) на mock-провайдере: диалоги о привязанном ребёнке, SSE-ответ
 * с контекстом ребёнка, политика доступа (чужой ребёнок — 403, чужой диалог — 404) и изоляция
 * от собственных чатов ученика у пользователя с обеими ролями. Нужна тестовая БД.
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AiRepository } from '../../src/modules/ai/ai.repository';
import { createTestApp, hasTestDatabase } from '../helpers/test-app';

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()) as Record<string, unknown>);
}

describe.skipIf(!hasTestDatabase)('ai: тьютор родителя (integration, mock AI)', () => {
  let app: INestApplication;
  const base = '/api/v1';
  const http = () => request(app.getHttpServer());
  const { alexey, dasha } = DEMO_IDS.students;

  /** Dev-вход; активная роль — первая в списке. */
  const login = async (maxUserId: string, roles: Role[]) => {
    const res = await http().post(`${base}/auth/dev`).send({ maxUserId, roles }).expect(200);
    return {
      token: `Bearer ${res.body.accessToken as string}`,
      me: res.body.me as { parent: { id: string } | null; student: { id: string } | null },
    };
  };

  const ask = async (token: string, conversationId: string, text: string) => {
    const res = await http()
      .post(`${base}/parent/ai/conversations/${conversationId}/messages`)
      .set('Authorization', token)
      .send({ text })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    return parseSse(res.text);
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('родитель: диалог о ребёнке, SSE-ответ по его контексту, история и список по ребёнку', async () => {
    const { token } = await login('max-parent-1', ['PARENT']);
    const created = await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', token)
      .expect(200);
    expect(created.body).toMatchObject({ kind: 'TUTOR', title: null });

    const events = await ask(token, created.body.id, 'Как Алексей занимается в последнее время?');
    expect(events.some((e) => e.type === 'token')).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });

    const overdue = await ask(token, created.body.id, 'Какие задания просрочены?');
    expect(overdue[overdue.length - 1]).toMatchObject({ type: 'done' });

    const messages = await http()
      .get(`${base}/parent/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', token)
      .expect(200);
    expect(messages.body.items.map((m: { role: string }) => m.role)).toEqual([
      'USER',
      'ASSISTANT',
      'USER',
      'ASSISTANT',
    ]);
    // Промпт родителя называет ребёнка по имени из профиля, а не по нику
    expect(messages.body.items[1].content).toContain('Алексей за последние 30 дней');
    expect(messages.body.items[3].content).toContain('Алексей: открытых заданий');

    const list = await http()
      .get(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', token)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({
      id: created.body.id,
      title: 'Как Алексей занимается в последнее время?',
    });
    const other = await http()
      .get(`${base}/parent/children/${dasha}/ai/conversations`)
      .set('Authorization', token)
      .expect(200);
    expect(other.body.items.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('чужой ребёнок — 403, чужой диалог — 404, ученику ручки родителя недоступны', async () => {
    const olga = await login('max-parent-1', ['PARENT']);
    const created = await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', olga.token)
      .expect(200);

    // Мария как родитель привязана только к Даше
    const maria = await login('max-teacher-1', ['PARENT']);
    await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', maria.token)
      .expect(403);
    await http()
      .get(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', maria.token)
      .expect(403);
    await http()
      .get(`${base}/parent/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', maria.token)
      .expect(404);
    await http()
      .post(`${base}/parent/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', maria.token)
      .send({ text: 'Привет' })
      .expect(404);
    await http()
      .post(`${base}/parent/children/${dasha}/ai/conversations`)
      .set('Authorization', maria.token)
      .expect(200);

    // Новый родитель без детей
    const lonely = await login(`max-parent-x-${Date.now()}`, ['PARENT']);
    await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', lonely.token)
      .expect(403);

    // Ученику нельзя (нет права parent:tutor.chat)
    const student = await login('max-student-1', ['STUDENT']);
    await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', student.token)
      .expect(403);
    await http()
      .post(`${base}/parent/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', student.token)
      .send({ text: 'Привет' })
      .expect(403);

    // Пустое сообщение и не-uuid id — 400
    await http()
      .post(`${base}/parent/ai/conversations/${created.body.id}/messages`)
      .set('Authorization', olga.token)
      .send({ text: '   ' })
      .expect(400);
    await http()
      .post(`${base}/parent/ai/conversations/not-a-uuid/messages`)
      .set('Authorization', olga.token)
      .send({ text: 'Привет' })
      .expect(400);
  });

  it('ученик и родитель в одном аккаунте: чаты не смешиваются; отвязка ребёнка закрывает диалог', async () => {
    const maxUserId = `max-dual-${Date.now()}`;
    const asParent = await login(maxUserId, ['PARENT', 'STUDENT']);
    const prisma = app.get(PrismaService);
    await prisma.parentStudentLink.create({
      data: { parentId: asParent.me.parent!.id, studentId: dasha, confirmedAt: new Date() },
    });

    const parentChat = await http()
      .post(`${base}/parent/children/${dasha}/ai/conversations`)
      .set('Authorization', asParent.token)
      .expect(200);
    await ask(asParent.token, parentChat.body.id, 'Где нужна помощь?');

    const asStudent = await login(maxUserId, ['STUDENT', 'PARENT']);
    const ownChat = await http()
      .post(`${base}/ai/conversations`)
      .set('Authorization', asStudent.token)
      .send({ kind: 'TUTOR' })
      .expect(200);
    const studentList = await http()
      .get(`${base}/ai/conversations?kind=TUTOR`)
      .set('Authorization', asStudent.token)
      .expect(200);
    const studentIds = studentList.body.items.map((c: { id: string }) => c.id);
    expect(studentIds).toContain(ownChat.body.id);
    expect(studentIds).not.toContain(parentChat.body.id);
    await http()
      .get(`${base}/ai/conversations/${parentChat.body.id}/messages`)
      .set('Authorization', asStudent.token)
      .expect(404);

    // Вопросы в режиме родителя (о Даше) — не активность самого ученика
    const since = new Date(Date.now() - 86_400_000);
    const repo = app.get(AiRepository);
    const ownStudentId = asParent.me.student!.id;
    const userId = (await prisma.studentProfile.findUniqueOrThrow({ where: { id: ownStudentId } }))
      .userId;
    expect(await repo.countUserMessagesSince(userId, ownStudentId, since)).toBe(0);

    // Собственный чат ученика не открывается через ручки родителя
    await http()
      .get(`${base}/parent/ai/conversations/${ownChat.body.id}/messages`)
      .set('Authorization', asParent.token)
      .expect(403);

    // Связь отозвана → доступ к диалогу о ребёнке закрыт
    await prisma.parentStudentLink.update({
      where: { parentId_studentId: { parentId: asParent.me.parent!.id, studentId: dasha } },
      data: { status: 'REVOKED' },
    });
    await http()
      .get(`${base}/parent/ai/conversations/${parentChat.body.id}/messages`)
      .set('Authorization', asParent.token)
      .expect(403);
  });

  it('список диалогов: курсор по ключам сортировки — страницы не теряют диалоги', async () => {
    const parent = await login(`max-parent-page-${Date.now()}`, ['PARENT']);
    const prisma = app.get(PrismaService);
    await prisma.parentStudentLink.create({
      data: { parentId: parent.me.parent!.id, studentId: dasha, confirmedAt: new Date() },
    });
    const create = async () =>
      (
        await http()
          .post(`${base}/parent/children/${dasha}/ai/conversations`)
          .set('Authorization', parent.token)
          .expect(200)
      ).body.id as string;
    const [a, b, c] = [await create(), await create(), await create()];
    const day = (n: number) => new Date(Date.UTC(2026, 8, n, 12));
    // A создан раньше всех, но писали в него последним; C — без сообщений (в конце).
    await prisma.aiConversation.update({
      where: { id: a },
      data: { createdAt: day(1), lastMessageAt: day(10) },
    });
    await prisma.aiConversation.update({
      where: { id: b },
      data: { createdAt: day(5), lastMessageAt: day(6) },
    });
    await prisma.aiConversation.update({
      where: { id: c },
      data: { createdAt: day(7), lastMessageAt: null },
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await http()
        .get(`${base}/parent/children/${dasha}/ai/conversations`)
        .query({ limit: 1, ...(cursor ? { cursor } : {}) })
        .set('Authorization', parent.token)
        .expect(200);
      seen.push(...res.body.items.map((item: { id: string }) => item.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual([a, b, c]);
  });

  it('сбой после начала стрима — событие error и закрытый ответ, а не зависшее соединение', async () => {
    const { token } = await login('max-parent-1', ['PARENT']);
    const created = await http()
      .post(`${base}/parent/children/${alexey}/ai/conversations`)
      .set('Authorization', token)
      .expect(200);
    const repo = app.get(AiRepository);
    const addMessage = repo.addMessage.bind(repo);
    const spy = vi.spyOn(repo, 'addMessage').mockImplementation(async (data) => {
      if (data.role === 'ASSISTANT') throw new Error('БД недоступна');
      return addMessage(data);
    });
    try {
      const events = await ask(token, created.body.id, 'Как Алексей занимается?');
      expect(events.some((e) => e.type === 'token')).toBe(true);
      expect(events[events.length - 1]).toMatchObject({ type: 'error', code: 'INTERNAL' });
    } finally {
      spy.mockRestore();
    }
  });
});
