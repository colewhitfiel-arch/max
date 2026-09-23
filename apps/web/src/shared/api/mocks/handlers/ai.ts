/**
 * ИИ: онбординг, диалоги тьютора (ученика и родителя), траектория. Стриминговые ручки отдают
 * `text/event-stream` из нескольких `data:`-строк через ReadableStream с задержкой — как настоящий SSE.
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
import { demoClubs } from '@edu/contracts/fixtures';
import { http, HttpResponse } from 'msw';
import { formatRelativeDay } from '../../../lib/dates';
import { buildMe, clubCard, gamification, statsBrief, studentBrief } from '../demo';
import { childHomework, homeworkCounts, type HomeworkEntry, sumCounts } from '../homework';
import {
  apiError,
  apiUrl,
  authed,
  denyForeignChild,
  json,
  noContent,
  paginate,
  readBody,
} from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';

/**
 * Кружки, которые онбординг рекомендует: только фикстурные (робототехника, Python) — причины ниже
 * написаны под них. Дополнительные кружки демо-мира (world-extras) в рекомендации не попадают.
 */
const onboardingClubs = () => db.clubs.filter((club) => demoClubs.some((d) => d.id === club.id));

/**
 * Вопросы онбординга после 1-го, 2-го и 3-го ответа (первый — в `/start`); 4-й ответ завершает
 * диалог. Порядок — как в mock-правилах `packages/ai` (цели → время и формат → «на потом»), так
 * что `futureInterests` берётся из 4-го ответа.
 */
const ONBOARDING_QUESTIONS = [
  'Здорово! А какие цели ты бы хотел достичь за этот год?',
  'Понял. Сколько часов в неделю ты готов уделять кружкам и как тебе больше нравится заниматься — практика, проекты, теория?',
  'И последнее: есть что-то, что хочется попробовать не сейчас, а попозже — через полгода-год?',
] as const;

/** Диалог ученика (не родительский — у пользователя могут быть обе роли). */
const isStudentConversation = (id: string) => !db.parentConversationIds.has(id);

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

/**
 * История диалога с конца, как у API: первая страница — последние `limit` сообщений (по
 * возрастанию времени), `nextCursor` ведёт к более старым.
 */
function messagesPage(request: Request, conversationId: string) {
  const items = db.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const result = paginate(request, items, { fromEnd: true });
  if (!result.ok) return result.response;
  return json(paginated(AiMessageDtoSchema), result.page);
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

const taskLabel = (e: HomeworkEntry, club: string) => `«${e.title}» (${club}, задание ${e.number})`;

const isOverdue = (e: HomeworkEntry) => e.status === 'FAILED' && !e.submittedAt;

/**
 * Ответ тьютора родителю (заглушка промпта `tutor.parent`): на «вы», о ребёнке, по цифрам
 * демо-мира — посещаемость, задания по кружкам, просрочки, ближайшие дедлайны.
 */
function parentTutorReply(studentId: string, question: string): string {
  const name = studentBrief(studentId).user.firstName;
  const groups = childHomework(studentId);
  if (groups.length === 0) {
    return `${name} пока не занимается ни в одном кружке, поэтому данных об успеваемости нет. Подобрать кружок можно в профиле — раздел «Кружки для ваших детей».`;
  }
  // Кружки от лучшего к худшему по доле правильных среди проверенных/просроченных.
  const clubs = groups
    .map(({ group, entries }) => {
      const counts = homeworkCounts(entries);
      const graded = counts.correct + counts.wrong;
      return {
        title: group.club.title,
        teacher: `${group.teacher.user.firstName} ${group.teacher.user.lastName ?? ''}`.trim(),
        entries,
        counts,
        rate: graded ? counts.correct / graded : 1,
      };
    })
    .sort((a, b) => b.rate - a.rate);
  const best = clubs[0]!;
  const worst = clubs[clubs.length - 1]!;
  const total = sumCounts(clubs.map((c) => c.counts));
  const lower = question.toLowerCase();

  if (/просроч|долг|не сда/.test(lower)) {
    const overdue = clubs.flatMap((c) =>
      c.entries.filter(isOverdue).map((e) => ({ e, club: c.title })),
    );
    if (overdue.length === 0) {
      return `Просроченных заданий сейчас нет — ${name} сдаёт всё вовремя. Впереди ещё заданий: ${total.upcoming}, ближайшие дедлайны видны в разделе «Успеваемость».`;
    }
    const top = [...clubs].sort(
      (a, b) => b.entries.filter(isOverdue).length - a.entries.filter(isOverdue).length,
    )[0]!;
    const examples = overdue
      .slice(-3)
      .map(({ e, club }) => taskLabel(e, club))
      .join(', ');
    return `Сейчас просрочено заданий: ${overdue.length}. Больше всего — в кружке «${top.title}». Последние из них: ${examples}. Лучше не ругать, а спокойно спросить, что помешало, и вместе выбрать время, чтобы их доделать.`;
  }

  if (/помощ|помочь|трудн|сложн|слаб|ошиб/.test(lower)) {
    if (worst.counts.wrong === 0) {
      return `Серьёзных трудностей не видно: ошибок и просрочек нет. Попросите ребёнка рассказать вам о последнем решённом задании — это хорошо закрепляет тему.`;
    }
    const strong = clubs.length > 1 ? `Сильная сторона — «${best.title}». ` : '';
    return `Больше всего ошибок в кружке «${worst.title}»: заданий, решённых меньше чем на 30% или не сданных вовремя, — ${worst.counts.wrong}. ${strong}Попросите ребёнка объяснить вам решение одного задания, а если трудности сохранятся — напишите преподавателю (${worst.teacher}).`;
  }

  if (/мотивац|поддерж|хвал|интерес/.test(lower)) {
    const { streakDays, points } = gamification(studentId);
    const streak =
      streakDays > 0
        ? `Серия активных дней — ${streakDays}`
        : 'Серия активных дней пока не набрана';
    return `${streak}, кристаллов на счету: ${points}. Хвалите за конкретные шаги: сданное задание, разобранную ошибку, занятие без опозданий. Договоритесь о небольшой награде за неделю без просрочек и чаще спрашивайте, что нового получилось в кружке «${best.title}».`;
  }

  if (/дедлайн|скоро|недел|ближайш|предстоит|срок/.test(lower)) {
    const soon = clubs
      .flatMap((c) =>
        c.entries.filter((e) => e.status === 'SOON').map((e) => ({ e, club: c.title })),
      )
      .sort((a, b) => (a.e.dueAt ?? '').localeCompare(b.e.dueAt ?? ''));
    if (soon.length === 0) {
      return `В ближайшие 3 дня дедлайнов нет, всего впереди заданий: ${total.upcoming}. Хорошее время, чтобы закрыть долги.`;
    }
    const list = soon
      .map(({ e, club }) => `${taskLabel(e, club)} — ${formatRelativeDay(e.dueAt!)}`)
      .join('; ');
    return `В ближайшие 3 дня нужно сдать: ${list}. Всего впереди заданий: ${total.upcoming}.`;
  }

  const stats = statsBrief(studentId);
  const attendance =
    stats.attendanceRate === null
      ? 'Данных о посещениях пока нет.'
      : `${name} посещает ${Math.round(stats.attendanceRate * 100)}% занятий за последний месяц.`;
  const focus =
    best !== worst
      ? `Лучше всего дела идут в кружке «${best.title}», больше внимания стоит уделить кружку «${worst.title}».`
      : `Основной кружок — «${best.title}».`;
  return `Коротко о главном. ${attendance} Задания: выполнено ${total.correct}, с ошибками или просрочено ${total.wrong}, впереди ещё ${total.upcoming}. ${focus} Предлагаю вместе составить план на неделю и начать с ближайших дедлайнов.`;
}

/** Диалог родителя с тьютором: свой (иначе 404) и о привязанном ребёнке (иначе 403). */
function parentConversation(
  userId: string,
  conversationId: string,
): Response | { id: string; studentId: string } {
  const conversation = db.conversations.find(
    (c) => c.id === conversationId && db.parentConversationIds.has(c.id),
  );
  if (!conversation || conversation.userId !== userId || !conversation.studentId)
    return apiError('NOT_FOUND', 'Диалог не найден');
  const denied = denyForeignChild(userId, conversation.studentId);
  if (denied) return denied;
  return { id: conversation.id, studentId: conversation.studentId };
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
      async ({ auth, request }) => {
        const body = await readBody(request, OnboardingMessageBodySchema);
        if (!body.ok) return body.response;
        // Только свой диалог онбординга (как requireOwnedOnboarding в API).
        const conversation = db.conversations.find(
          (c) =>
            c.id === body.data.conversationId &&
            c.kind === 'ONBOARDING' &&
            c.userId === auth.user.id,
        );
        if (!conversation) return apiError('NOT_FOUND', 'Диалог онбординга не найден');
        addMessage(conversation.id, 'USER', body.data.text);
        const userMessages = db.messages.filter(
          (m) => m.conversationId === conversation.id && m.role === 'USER',
        );
        const isComplete = userMessages.length > ONBOARDING_QUESTIONS.length;
        const reply = isComplete
          ? 'Спасибо! Я понял твои интересы. Сейчас подберу кружки, которые тебе подойдут.'
          : ONBOARDING_QUESTIONS[userMessages.length - 1]!;
        const message = addMessage(conversation.id, 'ASSISTANT', reply);
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
          items: onboardingClubs().map((club, index) => ({
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
        onboardingClubs().forEach((club, index) => {
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
          .filter(
            (c) =>
              c.userId === auth.user.id &&
              isStudentConversation(c.id) &&
              (!kind || c.kind === kind),
          )
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
      ({ auth, params, request }) => {
        const conversation = db.conversations.find(
          (c) => c.id === params.conversationId && isStudentConversation(c.id),
        );
        if (!conversation || conversation.userId !== auth.user.id)
          return apiError('NOT_FOUND', 'Диалог не найден');
        return messagesPage(request, conversation.id);
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ conversationId: string }>(
    apiUrl('/ai/conversations/:conversationId/messages'),
    authed(
      async ({ auth, params, request }) => {
        const conversation = db.conversations.find(
          (c) => c.id === params.conversationId && isStudentConversation(c.id),
        );
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
          (c) =>
            c.id === params.conversationId &&
            c.userId === auth.user.id &&
            isStudentConversation(c.id),
        );
        if (index < 0) return apiError('NOT_FOUND', 'Диалог не найден');
        db.conversations.splice(index, 1);
        db.messages = db.messages.filter((m) => m.conversationId !== params.conversationId);
        return noContent();
      },
      ['STUDENT'],
    ),
  ),

  // ---------- Тьютор родителя (о ребёнке, docs/07 F15) ----------
  http.get<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/ai/conversations'),
    authed(
      ({ auth, params }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const items = db.conversations
          .filter(
            (c) =>
              db.parentConversationIds.has(c.id) &&
              c.userId === auth.user.id &&
              c.studentId === params.studentId,
          )
          .sort((a, b) =>
            (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
          )
          .map((c) => conversationDto(c.id));
        return json(paginated(ConversationDtoSchema), { items });
      },
      ['PARENT'],
    ),
  ),

  http.post<{ studentId: string }>(
    apiUrl('/parent/children/:studentId/ai/conversations'),
    authed(
      ({ auth, params }) => {
        const denied = denyForeignChild(auth.user.id, params.studentId);
        if (denied) return denied;
        const conversation = {
          id: crypto.randomUUID(),
          userId: auth.user.id,
          studentId: params.studentId,
          kind: 'TUTOR' as const,
          title: null,
          lastMessageAt: null,
          createdAt: new Date().toISOString(),
        };
        db.conversations.push(conversation);
        db.parentConversationIds.add(conversation.id);
        return json(ConversationDtoSchema, conversationDto(conversation.id));
      },
      ['PARENT'],
    ),
  ),

  http.get<{ conversationId: string }>(
    apiUrl('/parent/ai/conversations/:conversationId/messages'),
    authed(
      ({ auth, params, request }) => {
        const found = parentConversation(auth.user.id, params.conversationId);
        if (found instanceof Response) return found;
        return messagesPage(request, found.id);
      },
      ['PARENT'],
    ),
  ),

  http.post<{ conversationId: string }>(
    apiUrl('/parent/ai/conversations/:conversationId/messages'),
    authed(
      async ({ auth, params, request }) => {
        const found = parentConversation(auth.user.id, params.conversationId);
        if (found instanceof Response) return found;
        const body = await readBody(request, TutorMessageBodySchema);
        if (!body.ok) return body.response;
        addMessage(found.id, 'USER', body.data.text);
        const reply = parentTutorReply(found.studentId, body.data.text);
        const message = addMessage(found.id, 'ASSISTANT', reply);
        return sseResponse(reply, { type: 'done', messageId: message.id });
      },
      ['PARENT'],
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
