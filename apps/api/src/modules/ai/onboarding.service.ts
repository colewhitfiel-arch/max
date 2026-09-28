import { Inject, Injectable } from '@nestjs/common';
import {
  AiService,
  type AiChatMessage,
  ClubRecommendationsSchema,
  ONBOARDING_MAX_ANSWERS,
  ONBOARDING_OPENING,
  type OnboardingProfile,
  OnboardingTurnSchema,
  buildRequest,
  onboardingTurnPrompt,
  recommendClubsPrompt,
  renderClubsForPrompt,
  tokenize,
} from '@edu/ai';
import type {
  ClubCard,
  ClubDemandReport,
  ClubInterestStatus,
  CompleteOnboardingBody,
  MeDto,
  OnboardingProfileDraft,
  OnboardingRecommendations,
  OnboardingStartResult,
} from '@edu/contracts';
import type { AiConversation } from '@edu/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { CatalogService } from '../catalog/catalog.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { AiRepository, type ClubInterestInput } from './ai.repository';
import { StudentContextBuilder } from './context-builder';
import type { SseSink } from './sse';
import { toMessageDto } from './tutor.service';
import { TRAJECTORY_JOB } from './trajectory.service';

const RECOMMENDATIONS_LIMIT = 5;
const DEMAND_REASONS_LIMIT = 3;
/** Сколько кружков максимум показывать кнопками под репликой тьютора. */
const CLUB_OPTIONS_LIMIT = 4;
/** Сколько сообщений незавершённого знакомства отдавать при возобновлении (диалог ≤ 7 ответов). */
const RESUME_HISTORY_LIMIT = 30;
/** Название чата знакомства в истории чатов тьютора после завершения онбординга. */
const ONBOARDING_CHAT_TITLE = 'Знакомство с тьютором';

/** Нормализация для сравнения названий кружков: регистр, «ё», знаки препинания. */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Упомянут ли кружок в тексте: каждое значимое слово названия (≥ 4 букв) встречается в тексте
 * с любым окончанием («Робототехника» ↔ «робототехнику», «Шахматы» ↔ «шахматах»). Название из
 * коротких слов («ИЗО») — только целым словом.
 */
function mentions(text: string, title: string): boolean {
  const words = normalize(text).split(' ');
  const titleWords = normalize(title).split(' ').filter(Boolean);
  const significant = titleWords.filter((word) => word.length >= 4);
  if (significant.length === 0)
    return titleWords.length > 0 && titleWords.every((w) => words.includes(w));
  return significant.every((word) => {
    const stem = word.slice(0, Math.max(4, word.length - 2));
    return words.some((candidate) => candidate.startsWith(stem));
  });
}

interface SnapshotRecommendation {
  clubId: string;
  score: number;
  reason: string;
}

interface OnboardingSnapshot {
  profileDraft?: OnboardingProfile;
  /** Что показали ученику — чтобы при complete зафиксировать SKIPPED и причины/оценки. */
  recommendations?: SnapshotRecommendation[];
  /** Кружки-кнопки под последней репликой тьютора — вернуть их при возобновлении диалога. */
  clubOptionIds?: string[];
}

/** Онбординг ученика (F1): диалог с ИИ → черновик профиля → подбор кружков → зачисление. */
@Injectable()
export class OnboardingService {
  private readonly log;

  constructor(
    private readonly repo: AiRepository,
    private readonly ai: AiService,
    private readonly catalog: CatalogService,
    private readonly groups: GroupsService,
    private readonly identity: IdentityService,
    private readonly contexts: StudentContextBuilder,
    private readonly events: DomainEventBus,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'ai.onboarding' });
  }

  /**
   * Начать знакомство или продолжить незавершённое (обновили страницу, вернулись позже): у
   * продолжения — вся лента, собранный профиль (если диалог уже завершён) и кнопки кружков
   * последней реплики. Новый диалог — первый вопрос без вызова модели.
   */
  async start(user: AuthUser): Promise<OnboardingStartResult> {
    const studentId = this.requireStudent(user);
    const existing = await this.repo.latestConversation(user.userId, 'ONBOARDING');
    if (existing) {
      const rows = await this.repo.recentMessages(existing.id, RESUME_HISTORY_LIMIT);
      const first = rows[0];
      if (first) {
        const snapshot = (existing.contextSnapshot as OnboardingSnapshot | null) ?? {};
        const clubOptions = await this.clubCardsByIds(studentId, snapshot.clubOptionIds ?? []);
        return {
          conversationId: existing.id,
          message: toMessageDto(first),
          history: rows.map(toMessageDto),
          ...(snapshot.profileDraft ? { profileDraft: snapshot.profileDraft } : {}),
          ...(clubOptions.length > 0 && !snapshot.profileDraft ? { clubOptions } : {}),
        };
      }
    }
    const conversation = await this.repo.createConversation({
      userId: user.userId,
      studentId,
      kind: 'ONBOARDING',
      title: 'Знакомство',
    });
    const message = await this.repo.addMessage({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: ONBOARDING_OPENING,
    });
    return { conversationId: conversation.id, message: toMessageDto(message) };
  }

  /** Реплика: модель отвечает JSON (reply + isComplete + profileDraft), reply стримится токенами. */
  async message(
    user: AuthUser,
    conversationId: string,
    text: string,
    sink: SseSink,
  ): Promise<void> {
    const studentId = this.requireStudent(user);
    const conversation = await this.requireOwnedOnboarding(user, conversationId);
    const answer = text.trim().slice(0, 1000);
    if (!answer) throw Errors.validation('Пустое сообщение');

    // Ответ ученика сохраняется только вместе с ответом модели: сбой не оставляет дублей
    // в истории и не приближает принудительное завершение (answered)
    const rows = await this.repo.recentMessages(conversation.id, 29);
    const history: AiChatMessage[] = rows.map((m) => ({
      role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: m.content,
    }));
    history.push({ role: 'user', content: answer });
    const answered = rows.filter((m) => m.role === 'USER').length + 1;
    const transcript = [...rows.map((m) => m.content), answer];

    const student = await this.identity.getStudentProfile(studentId);
    const clubs = await this.clubPool(student?.schoolId ?? null);
    const request = buildRequest(
      onboardingTurnPrompt,
      {
        studentName: student?.user.nickname ?? student?.user.firstName ?? 'друг',
        clubsSummary: clubs.map((c) => c.title).join(', '),
        answered,
      },
      { history, metadata: { userId: user.userId }, signal: sink.signal },
    );

    let turn;
    try {
      turn = (await this.ai.chatJson(request, OnboardingTurnSchema)).data;
    } catch (error) {
      if (sink.signal.aborted) {
        // Клиент ушёл сам — это не сбой модели, писать в закрытый поток нечего
        this.log.debug({ conversationId: conversation.id }, 'онбординг: клиент отключился');
        return;
      }
      this.log.error(
        { conversationId: conversation.id, err: error },
        'онбординг: модель не ответила',
      );
      sink.write({
        type: 'error',
        code: 'EXTERNAL_INTEGRATION',
        message: 'ИИ сейчас недоступен, попробуй позже',
      });
      return;
    }
    if (!turn.isComplete && answered >= ONBOARDING_MAX_ANSWERS) {
      turn = {
        ...turn,
        isComplete: true,
        profileDraft: turn.profileDraft ?? this.fallbackProfile(transcript),
      };
    }
    if (turn.isComplete && !turn.profileDraft) turn.profileDraft = this.fallbackProfile(transcript);

    await this.repo.addMessage({ conversationId: conversation.id, role: 'USER', content: answer });
    const saved = await this.repo.addMessage({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: turn.reply,
      promptId: onboardingTurnPrompt.key,
    });
    // Кружки, предложенные репликой, — кнопками: названия от модели + упомянутые в тексте.
    const clubOptions = turn.isComplete
      ? []
      : this.clubOptions(turn.reply, turn.clubOptions ?? [], clubs);
    const snapshot: OnboardingSnapshot = {
      ...((conversation.contextSnapshot as OnboardingSnapshot | null) ?? {}),
      clubOptionIds: clubOptions.map((club) => club.id),
      ...(turn.isComplete && turn.profileDraft ? { profileDraft: turn.profileDraft } : {}),
    };
    await this.repo.setConversationSnapshot(conversation.id, snapshot as never);
    for (const token of tokenize(turn.reply)) sink.write({ type: 'token', text: token });
    sink.write({
      type: 'done',
      messageId: saved.id,
      isComplete: turn.isComplete,
      ...(turn.isComplete && turn.profileDraft ? { profileDraft: turn.profileDraft } : {}),
      ...(clubOptions.length > 0 ? { clubOptions } : {}),
    });
  }

  /**
   * Кружки для кнопок быстрого ответа: сперва названные моделью в `clubOptions` (сверяются
   * со списком школы — выдуманных нет), затем упомянутые в тексте реплики; до 4 штук.
   */
  private clubOptions(reply: string, named: string[], pool: ClubCard[]): ClubCard[] {
    const picked = new Map<string, ClubCard>();
    for (const name of named) {
      const key = normalize(name);
      if (!key) continue;
      const club =
        pool.find((c) => normalize(c.title) === key) ??
        pool.find((c) => mentions(name, c.title) || mentions(c.title, name));
      if (club) picked.set(club.id, club);
    }
    for (const club of pool) {
      if (!picked.has(club.id) && mentions(reply, club.title)) picked.set(club.id, club);
    }
    return [...picked.values()].slice(0, CLUB_OPTIONS_LIMIT);
  }

  /** Карточки кружков по id — только из пула ученика, в том же порядке. */
  private async clubCardsByIds(studentId: string, ids: string[]): Promise<ClubCard[]> {
    if (ids.length === 0) return [];
    const student = await this.identity.getStudentProfile(studentId);
    const pool = await this.clubPool(student?.schoolId ?? null);
    const byId = new Map(pool.map((club) => [club.id, club]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** Кружки школы, отранжированные моделью под профиль (черновик из диалога или сохранённый). */
  async recommendations(user: AuthUser): Promise<OnboardingRecommendations> {
    const studentId = this.requireStudent(user);
    const student = await this.identity.getStudentProfile(studentId);
    if (!student) throw Errors.forbidden('Нет профиля ученика');
    const latest = await this.repo.latestConversation(user.userId, 'ONBOARDING');
    const draft = (latest?.contextSnapshot as OnboardingSnapshot | null)?.profileDraft;
    const profile: OnboardingProfile = draft ?? {
      interests: student.interests,
      goals: student.goals,
      weeklyHours: student.weeklyHours ?? 0,
      preferredFormats: student.preferredFormats,
      futureInterests: student.futureInterests,
      summary: student.aiProfileSummary ?? '',
    };
    const pool = await this.clubPool(student.schoolId);
    if (pool.length === 0) return { items: [] };

    const request = buildRequest(
      recommendClubsPrompt,
      {
        profileText: this.profileText(profile),
        clubsText: renderClubsForPrompt(pool),
        limit: RECOMMENDATIONS_LIMIT,
      },
      { metadata: { userId: user.userId } },
    );
    const byId = new Map(pool.map((c) => [c.id, c]));
    let items: OnboardingRecommendations['items'] = [];
    try {
      const { data } = await this.ai.chatJson(request, ClubRecommendationsSchema);
      const seen = new Set<string>();
      items = data.items
        .filter((item) => byId.has(item.clubId) && !seen.has(item.clubId) && seen.add(item.clubId))
        .sort((a, b) => b.score - a.score)
        .slice(0, RECOMMENDATIONS_LIMIT)
        .map((item) => ({ club: byId.get(item.clubId)!, reason: item.reason, score: item.score }));
    } catch (error) {
      this.log.warn({ err: error }, 'рекомендации: модель не ответила, показываем каталог');
    }
    if (items.length === 0) items = this.fallbackRecommendations(profile, pool);
    if (latest) {
      const snapshot: OnboardingSnapshot = {
        ...((latest.contextSnapshot as OnboardingSnapshot | null) ?? {}),
        recommendations: items.map((i) => ({
          clubId: i.club.id,
          score: i.score,
          reason: i.reason,
        })),
      };
      await this.repo.setConversationSnapshot(latest.id, snapshot as never);
    }
    return { items };
  }

  /**
   * Завершение: профиль (включая «на будущее») → запись в выбранные кружки → фиксация спроса
   * (CHOSEN / LATER / SKIPPED по показанным рекомендациям) → диалог знакомства становится чатом
   * с тьютором → пересборка контекста и траектории.
   */
  async complete(user: AuthUser, body: CompleteOnboardingBody): Promise<MeDto> {
    const studentId = this.requireStudent(user);
    const student = await this.identity.getStudentProfile(studentId);
    if (!student) throw Errors.forbidden('Нет профиля ученика');
    await this.identity.completeStudentOnboarding(studentId, body.profileDraft);

    // Записать и учесть спрос можно только по кружкам, доступным ученику (как в рекомендациях):
    // чужой clubId из тела запроса не даёт зачисления в группу другой школы
    const pool = await this.clubPool(student.schoolId);
    const known = new Set(pool.map((c) => c.id));
    const chosen = new Set(body.selectedClubIds.filter((id) => known.has(id)));
    const later = new Set(body.laterClubIds.filter((id) => known.has(id) && !chosen.has(id)));
    for (const clubId of chosen) {
      const group = await this.groups.findFirstActiveGroupOfClub(clubId);
      if (!group) continue;
      const { enrollmentId, created } = await this.groups.enroll(studentId, group.id);
      if (created) {
        await this.events.emit('enrollment.created', {
          enrollmentId,
          studentId,
          groupId: group.id,
          at: new Date().toISOString(),
        });
      }
    }

    const latest = await this.repo.latestConversation(user.userId, 'ONBOARDING');
    const snapshot = (latest?.contextSnapshot as OnboardingSnapshot | null) ?? {};
    const shown = new Map((snapshot.recommendations ?? []).map((r) => [r.clubId, r]));
    const interests = new Map<string, ClubInterestInput>();
    const put = (clubId: string, status: ClubInterestStatus) => {
      const rec = shown.get(clubId);
      interests.set(clubId, {
        clubId,
        status,
        score: rec?.score ?? null,
        reason: rec?.reason ?? null,
      });
    };
    for (const clubId of shown.keys()) put(clubId, 'SKIPPED');
    for (const clubId of later) put(clubId, 'LATER');
    for (const clubId of chosen) put(clubId, 'CHOSEN');
    const rows = [...interests.values()].filter((row) => known.has(row.clubId));
    if (rows.length > 0) await this.repo.replaceClubInterests(studentId, rows);

    if (latest) await this.turnIntoTutorChat(latest, chosen, later, body.profileDraft, pool);

    await this.contexts.invalidate(studentId);
    await this.events.emit('student.profile.updated', { studentId, at: new Date().toISOString() });
    await this.queue.enqueue(
      'ai',
      TRAJECTORY_JOB,
      { studentId },
      { jobId: `trajectory-${studentId}`, attempts: 2 },
    );
    this.log.info(
      {
        studentId,
        chosen: chosen.size,
        later: later.size,
        skipped: rows.length - chosen.size - later.size,
      },
      'онбординг завершён',
    );
    return this.identity.getMe(user.userId, user.activeRole);
  }

  /** Спрос на кружки школы преподавателя: записались / хотят позже / пропустили + «на будущее». */
  async demand(user: AuthUser): Promise<ClubDemandReport> {
    if (user.activeRole !== 'TEACHER' || !user.profileId)
      throw Errors.forbidden('Нет профиля преподавателя');
    const schoolId = await this.identity.getTeacherSchoolId(user.profileId);
    if (!schoolId) throw Errors.forbidden('Нет профиля преподавателя');
    const [clubs, rows, reasons, students] = await Promise.all([
      this.catalog.listActiveClubCards(schoolId),
      this.repo.clubDemandRows(schoolId),
      this.repo.clubInterestReasons(schoolId),
      this.repo.futureInterestsOfSchool(schoolId),
    ]);
    const reasonsByClub = new Map<string, string[]>();
    for (const { clubId, reason } of reasons) {
      const list = reasonsByClub.get(clubId) ?? [];
      if (list.length < DEMAND_REASONS_LIMIT && !list.includes(reason)) list.push(reason);
      reasonsByClub.set(clubId, list);
    }
    const items = clubs
      .map((club) => {
        const mine = rows.filter((r) => r.clubId === club.id);
        const count = (status: ClubInterestStatus) =>
          mine.find((r) => r.status === status)?.count ?? 0;
        const scored = mine.filter((r) => r.avgScore !== null);
        const weight = scored.reduce((sum, r) => sum + r.count, 0);
        const avgScore =
          weight > 0
            ? Number(
                (scored.reduce((sum, r) => sum + (r.avgScore ?? 0) * r.count, 0) / weight).toFixed(
                  3,
                ),
              )
            : null;
        return {
          club,
          chosen: count('CHOSEN'),
          later: count('LATER'),
          skipped: count('SKIPPED'),
          avgScore,
          reasons: reasonsByClub.get(club.id) ?? [],
        };
      })
      .sort((a, b) => b.chosen + b.later - (a.chosen + a.later) || b.chosen - a.chosen);

    const futureCounts = new Map<string, { label: string; count: number }>();
    for (const student of students) {
      for (const raw of new Set(student.futureInterests.map((f) => f.trim()).filter(Boolean))) {
        const key = raw.toLowerCase();
        const entry = futureCounts.get(key) ?? { label: raw, count: 0 };
        entry.count += 1;
        futureCounts.set(key, entry);
      }
    }
    return {
      students: students.length,
      futureInterests: [...futureCounts.values()].sort((a, b) => b.count - a.count),
      items,
    };
  }

  /**
   * Диалог знакомства продолжается как обычный чат с тьютором: kind → TUTOR, плюс итоговая реплика
   * (детерминированная, без модели), чтобы ученик видел, что тьютор его запомнил.
   */
  private async turnIntoTutorChat(
    conversation: AiConversation,
    chosen: Set<string>,
    later: Set<string>,
    profile: OnboardingProfileDraft,
    pool: ClubCard[],
  ): Promise<void> {
    const titles = new Map(pool.map((c) => [c.id, c.title]));
    const names = (ids: Set<string>) =>
      [...ids].map((id) => titles.get(id)).filter((t): t is string => !!t);
    const nowNames = names(chosen);
    const laterNames = [...names(later), ...profile.futureInterests];
    const lines = [
      nowNames.length > 0
        ? `Записал тебя: ${nowNames.join(', ')}.`
        : 'Пока без записи в кружки — вернёмся к этому, когда захочешь.',
      laterNames.length > 0
        ? `На будущее запомнил: ${laterNames.join(', ')} — напомню, когда будет время.`
        : '',
      'Теперь я твой тьютор: спрашивай про расписание, задания и темы — я всё помню из нашего знакомства.',
    ].filter(Boolean);
    await this.repo.addMessage({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: lines.join(' '),
    });
    // В истории чатов тьютора знакомство видно под своим названием.
    await this.repo.updateConversation(conversation.id, {
      kind: 'TUTOR',
      title: ONBOARDING_CHAT_TITLE,
    });
  }

  // ---------- внутреннее ----------

  /**
   * Кружки, из которых ученик выбирает: активные кружки его школы; если их нет (или школы нет) —
   * все активные. Один пул для диалога, рекомендаций и записи.
   */
  private async clubPool(schoolId: string | null): Promise<ClubCard[]> {
    const clubs = await this.catalog.listActiveClubCards(schoolId);
    if (clubs.length > 0 || !schoolId) return clubs;
    return this.catalog.listActiveClubCards(null);
  }

  private requireStudent(user: AuthUser): string {
    if (user.activeRole !== 'STUDENT' || !user.profileId)
      throw Errors.forbidden('Нет профиля ученика');
    return user.profileId;
  }

  private async requireOwnedOnboarding(
    user: AuthUser,
    conversationId: string,
  ): Promise<AiConversation> {
    const row = await this.repo.findConversation(conversationId);
    if (!row || row.userId !== user.userId || row.kind !== 'ONBOARDING')
      throw Errors.notFound('Диалог онбординга');
    return row;
  }

  private profileText(profile: OnboardingProfileDraft): string {
    return [
      profile.interests.length ? `Интересы: ${profile.interests.join(', ')}` : '',
      profile.goals.length ? `Цели: ${profile.goals.join(', ')}` : '',
      profile.weeklyHours ? `Готов заниматься: ${profile.weeklyHours} ч/нед` : '',
      profile.preferredFormats.length ? `Форматы: ${profile.preferredFormats.join(', ')}` : '',
      profile.futureInterests.length
        ? `Хочет попробовать позже (не сейчас): ${profile.futureInterests.join(', ')}`
        : '',
      profile.summary ? `О ученике: ${profile.summary}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private fallbackProfile(userAnswers: string[]): OnboardingProfile {
    const words = [
      ...new Set(
        userAnswers
          .join(' ')
          .toLowerCase()
          .split(/[^\p{L}]+/u)
          .filter((w) => w.length > 4),
      ),
    ];
    return {
      interests: words.slice(0, 5),
      goals: [],
      weeklyHours: 0,
      preferredFormats: [],
      futureInterests: [],
      summary: userAnswers.slice(0, 2).join(' ').slice(0, 200),
    };
  }

  /** Без модели: пересечение слов профиля с тегами/описанием кружка. */
  private fallbackRecommendations(
    profile: OnboardingProfileDraft,
    pool: ClubCard[],
  ): OnboardingRecommendations['items'] {
    const words = new Set(
      [...profile.interests, ...profile.goals, ...profile.preferredFormats]
        .join(' ')
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((w) => w.length > 3),
    );
    return pool
      .map((club) => {
        const haystack = `${club.title} ${club.description} ${club.tags.join(' ')}`.toLowerCase();
        const hits = [...words].filter((w) => haystack.includes(w)).length;
        return {
          club,
          reason: 'Подходит по интересам из твоего профиля',
          score: Math.min(1, 0.5 + hits * 0.15),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, RECOMMENDATIONS_LIMIT);
  }
}
