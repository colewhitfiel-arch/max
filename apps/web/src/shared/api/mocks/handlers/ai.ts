/**
 * ИИ: онбординг, диалоги тьютора, траектория. Стриминговые ручки отдают `text/event-stream`
 * из нескольких `data:`-строк через ReadableStream с задержкой — как настоящий SSE.
 */
import {
  AiMessageDtoSchema,
  type AiStreamEvent,
  ClubDemandReportSchema,
  CompleteOnboardingBodySchema,
  ConversationDtoSchema,
  CreateConversationBodySchema,
  MeDtoSchema,
  OnboardingMessageBodySchema,
  OnboardingRecommendationsSchema,
  OnboardingStartResultSchema,
  type OnboardingStreamEvent,
  TrajectoryDtoSchema,
  TrajectoryRefreshResultSchema,
  TutorMessageBodySchema,
  paginated,
} from '@edu/contracts';
import { http, HttpResponse } from 'msw';
import { buildMe, clubCard } from '../demo';
import { apiError, apiUrl, authed, json, noContent, readBody } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';

const conversationDto = (id: string) => {
  const c = db.conversations.find((x) => x.id === id)!;
  return { id: c.id, kind: c.kind, title: c.title, lastMessageAt: c.lastMessageAt };
};

function addMessage(conversationId: string, role: 'USER' | 'ASSISTANT', content: string) {
  const message = {
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  db.messages.push(message);
  const conversation = db.conversations.find((c) => c.id === conversationId);
  if (conversation) {
    conversation.lastMessageAt = message.createdAt;
    if (!conversation.title && role === 'USER') conversation.title = content.slice(0, 40);
  }
  return message;
}

/** SSE-ответ: токены по словам с задержкой, затем done. */
function sseResponse(text: string, done: AiStreamEvent | OnboardingStreamEvent, delayMs = 40) {
  const encoder = new TextEncoder();
  const words = text.split(' ');
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < words.length; i += 1) {
        const token: AiStreamEvent = { type: 'token', text: (i === 0 ? '' : ' ') + words[i] };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(token)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function tutorReply(question: string): string {
  const lower = question.toLowerCase();
  if (lower.includes('сегодня')) {
    return 'Сегодня в 15:00 занятие по робототехнике (каб. 12), тема — датчики расстояния. Ещё стоит сдать задачи 1–10 по Python до пятницы.';
  }
  if (lower.includes('python') || lower.includes('цикл')) {
    return 'Цикл for в Python перебирает элементы последовательности: for i in range(5): print(i) выведет числа от 0 до 4. Попробуй изменить range и посмотреть результат.';
  }
  return 'Хороший вопрос! Давай разберём по шагам: сначала сформулируй, что уже известно, потом — что нужно найти. Если хочешь, покажу пример из твоего курса по робототехнике.';
}

export const aiHandlers = [
  // ---------- Онбординг ----------
  http.post(
    apiUrl('/student/onboarding/start'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const conversation = {
          id: crypto.randomUUID(),
          userId: auth.user.id,
          studentId: student.id,
          kind: 'ONBOARDING' as const,
          title: 'Онбординг',
          lastMessageAt: null,
          createdAt: new Date().toISOString(),
        };
        db.conversations.push(conversation);
        const message = addMessage(
          conversation.id,
          'ASSISTANT',
          'Привет! Расскажи, чем тебе нравится заниматься в свободное время?',
        );
        return json(OnboardingStartResultSchema, { conversationId: conversation.id, message });
      },
      ['STUDENT'],
    ),
  ),

  http.post(
    apiUrl('/student/onboarding/messages'),
    authed(
      async ({ request }) => {
        const body = await readBody(request, OnboardingMessageBodySchema);
        if (!body.ok) return body.response;
        addMessage(body.data.conversationId, 'USER', body.data.text);
        const userMessages = db.messages.filter(
          (m) => m.conversationId === body.data.conversationId && m.role === 'USER',
        );
        const isComplete = userMessages.length >= 4;
        const reply = isComplete
          ? 'Спасибо! Я понял твои интересы. Сейчас подберу кружки, которые тебе подойдут.'
          : userMessages.length === 3
            ? 'И последнее: есть что-то, что хочется попробовать не сейчас, а попозже — через полгода-год?'
            : 'Здорово! А какие цели ты бы хотел достичь за этот год?';
        const message = addMessage(body.data.conversationId, 'ASSISTANT', reply);
        return sseResponse(reply, {
          type: 'done',
          messageId: message.id,
          isComplete,
          ...(isComplete
            ? {
                profileDraft: {
                  interests: ['роботы', 'программирование'],
                  goals: ['научиться программировать'],
                  weeklyHours: 4,
                  preferredFormats: ['практика'],
                  futureInterests: [userMessages[3]?.content.slice(0, 60) ?? 'шахматы'],
                  summary: 'Интересуется робототехникой и программированием.',
                },
              }
            : {}),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/student/onboarding/recommendations'),
    authed(
      () =>
        json(OnboardingRecommendationsSchema, {
          items: db.clubs.map((club, index) => ({
            club: clubCard(club.id),
            reason:
              index === 0
                ? 'Совпадает с интересом к роботам'
                : 'Поможет достичь цели «научиться программировать»',
            score: index === 0 ? 0.92 : 0.81,
          })),
        }),
      ['STUDENT'],
    ),
  ),

  http.post(
    apiUrl('/student/onboarding/complete'),
    authed(
      async ({ auth, request }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const body = await readBody(request, CompleteOnboardingBodySchema);
        if (!body.ok) return body.response;
        student.onboardingCompletedAt = new Date().toISOString();
        student.interests = body.data.profileDraft.interests;
        student.goals = body.data.profileDraft.goals;
        student.weeklyHours = body.data.profileDraft.weeklyHours;
        student.preferredFormats = body.data.profileDraft.preferredFormats;
        student.aiProfileSummary = body.data.profileDraft.summary || null;
        student.futureInterests = body.data.profileDraft.futureInterests;
        // Спрос: показанные кружки → SKIPPED, отмеченные «позже» → LATER, выбранные → CHOSEN
        const chosen = new Set(body.data.selectedClubIds);
        const later = new Set(body.data.laterClubIds.filter((id) => !chosen.has(id)));
        db.clubInterests = db.clubInterests.filter((i) => i.studentId !== student.id);
        db.clubs.forEach((club, index) => {
          const status = chosen.has(club.id) ? 'CHOSEN' : later.has(club.id) ? 'LATER' : 'SKIPPED';
          db.clubInterests.push({
            studentId: student.id,
            clubId: club.id,
            status,
            score: index === 0 ? 0.92 : 0.81,
            reason: index === 0 ? 'Совпадает с интересом к роботам' : 'Поможет достичь цели',
          });
        });
        for (const clubId of body.data.selectedClubIds) {
          const group = db.groups.find((g) => g.clubId === clubId && g.isActive);
          if (
            group &&
            !db.enrollments.some((e) => e.studentId === student.id && e.groupId === group.id)
          ) {
            db.enrollments.push({
              id: crypto.randomUUID(),
              studentId: student.id,
              groupId: group.id,
              status: 'ACTIVE',
              enrolledAt: new Date().toISOString(),
              leftAt: null,
            });
          }
        }
        return json(MeDtoSchema, buildMe(auth.user, auth.role));
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/clubs/demand'),
    authed(
      ({ auth }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const rows = db.clubInterests;
        const studentIds = new Set(rows.map((r) => r.studentId));
        const futureCounts = new Map<string, { label: string; count: number }>();
        for (const student of db.students.filter((s) => studentIds.has(s.id))) {
          for (const label of new Set(student.futureInterests)) {
            const entry = futureCounts.get(label.toLowerCase()) ?? { label, count: 0 };
            entry.count += 1;
            futureCounts.set(label.toLowerCase(), entry);
          }
        }
        return json(ClubDemandReportSchema, {
          students: studentIds.size,
          futureInterests: [...futureCounts.values()].sort((a, b) => b.count - a.count),
          items: db.clubs
            .filter((c) => c.schoolId === teacher.schoolId && c.isActive)
            .map((club) => {
              const mine = rows.filter((r) => r.clubId === club.id);
              const scored = mine.filter((r) => r.score !== null);
              return {
                club: clubCard(club.id),
                chosen: mine.filter((r) => r.status === 'CHOSEN').length,
                later: mine.filter((r) => r.status === 'LATER').length,
                skipped: mine.filter((r) => r.status === 'SKIPPED').length,
                avgScore: scored.length
                  ? scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length
                  : null,
                reasons: [
                  ...new Set(
                    mine
                      .filter((r) => r.status !== 'SKIPPED' && r.reason)
                      .map((r) => r.reason as string),
                  ),
                ].slice(0, 3),
              };
            })
            .sort((a, b) => b.chosen + b.later - (a.chosen + a.later)),
        });
      },
      ['TEACHER'],
    ),
  ),

  // ---------- Тьютор ----------
  http.get(
    apiUrl('/ai/conversations'),
    authed(
      ({ auth, request }) => {
        const kind = new URL(request.url).searchParams.get('kind');
        const items = db.conversations
          .filter((c) => c.userId === auth.user.id && (!kind || c.kind === kind))
          .sort((a, b) =>
            (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
          )
          .map((c) => conversationDto(c.id));
        return json(paginated(ConversationDtoSchema), { items });
      },
      ['STUDENT'],
    ),
  ),

  http.post(
    apiUrl('/ai/conversations'),
    authed(
      async ({ auth, request }) => {
        const body = await readBody(request, CreateConversationBodySchema);
        if (!body.ok) return body.response;
        const conversation = {
          id: crypto.randomUUID(),
          userId: auth.user.id,
          studentId: studentOfUser(auth.user.id)?.id ?? null,
          kind: body.data.kind,
          title: null,
          lastMessageAt: null,
          createdAt: new Date().toISOString(),
        };
        db.conversations.push(conversation);
        return json(ConversationDtoSchema, conversationDto(conversation.id));
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ conversationId: string }>(
    apiUrl('/ai/conversations/:conversationId/messages'),
    authed(
      ({ auth, params }) => {
        const conversation = db.conversations.find((c) => c.id === params.conversationId);
        if (!conversation || conversation.userId !== auth.user.id)
          return apiError('NOT_FOUND', 'Диалог не найден');
        const items = db.messages
          .filter((m) => m.conversationId === conversation.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return json(paginated(AiMessageDtoSchema), { items });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ conversationId: string }>(
    apiUrl('/ai/conversations/:conversationId/messages'),
    authed(
      async ({ auth, params, request }) => {
        const conversation = db.conversations.find((c) => c.id === params.conversationId);
        if (!conversation || conversation.userId !== auth.user.id)
          return apiError('NOT_FOUND', 'Диалог не найден');
        const body = await readBody(request, TutorMessageBodySchema);
        if (!body.ok) return body.response;
        addMessage(conversation.id, 'USER', body.data.text);
        const reply = tutorReply(body.data.text);
        const message = addMessage(conversation.id, 'ASSISTANT', reply);
        return sseResponse(reply, { type: 'done', messageId: message.id });
      },
      ['STUDENT'],
    ),
  ),

  http.delete<{ conversationId: string }>(
    apiUrl('/ai/conversations/:conversationId'),
    authed(
      ({ auth, params }) => {
        const index = db.conversations.findIndex(
          (c) => c.id === params.conversationId && c.userId === auth.user.id,
        );
        if (index < 0) return apiError('NOT_FOUND', 'Диалог не найден');
        db.conversations.splice(index, 1);
        db.messages = db.messages.filter((m) => m.conversationId !== params.conversationId);
        return noContent();
      },
      ['STUDENT'],
    ),
  ),

  // ---------- Траектория ----------
  http.get(
    apiUrl('/student/trajectory'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        const trajectory = student && db.trajectories.find((t) => t.studentId === student.id);
        return json(TrajectoryDtoSchema.nullable(), trajectory ?? null);
      },
      ['STUDENT'],
    ),
  ),

  http.post(
    apiUrl('/student/trajectory/refresh'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        setTimeout(() => {
          const existing = db.trajectories.find((t) => t.studentId === student.id);
          if (existing) existing.generatedAt = new Date().toISOString();
        }, 3000);
        return json(TrajectoryRefreshResultSchema, { queued: true }, 202);
      },
      ['STUDENT'],
    ),
  ),
];
