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
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { AiRepository } from './ai.repository';
import { StudentContextBuilder } from './context-builder';
import type { SseSink } from './sse';
import { toMessageDto } from './tutor.service';
import { TRAJECTORY_JOB } from './trajectory.service';

const RECOMMENDATIONS_LIMIT = 5;

interface OnboardingSnapshot {
  profileDraft?: OnboardingProfile;
}

/** Онбординг ученика (F1): диалог с ИИ → черновик профиля → подбор кружков → зачисление. */
@Injectable()
export class OnboardingService {
  private readonly log;

  constructor(
    private readonly repo: AiRepository,
    private readonly prisma: PrismaService,
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

  async start(user: AuthUser): Promise<OnboardingStartResult> {
    const studentId = this.requireStudent(user);
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

    await this.repo.addMessage({ conversationId: conversation.id, role: 'USER', content: answer });
    const rows = await this.repo.recentMessages(conversation.id, 30);
    const history: AiChatMessage[] = rows.map((m) => ({
      role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: m.content,
    }));
    const answered = rows.filter((m) => m.role === 'USER').length;

    const [student, clubs] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { id: studentId },
        select: { schoolId: true, user: { select: { firstName: true, nickname: true } } },
      }),
      this.catalog.listActiveClubCards(null),
    ]);
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
        profileDraft: turn.profileDraft ?? this.fallbackProfile(rows.map((m) => m.content)),
      };
    }
    if (turn.isComplete && !turn.profileDraft)
      turn.profileDraft = this.fallbackProfile(rows.map((m) => m.content));

    const saved = await this.repo.addMessage({
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: turn.reply,
      promptId: onboardingTurnPrompt.key,
    });
    if (turn.isComplete && turn.profileDraft) {
      const snapshot: OnboardingSnapshot = { profileDraft: turn.profileDraft };
      await this.repo.setConversationSnapshot(conversation.id, snapshot as never);
    }
    for (const token of tokenize(turn.reply)) sink.write({ type: 'token', text: token });
    sink.write({
      type: 'done',
      messageId: saved.id,
      isComplete: turn.isComplete,
      ...(turn.isComplete && turn.profileDraft ? { profileDraft: turn.profileDraft } : {}),
    });
  }

  /** Кружки школы, отранжированные моделью под профиль (черновик из диалога или сохранённый). */
  async recommendations(user: AuthUser): Promise<OnboardingRecommendations> {
    const studentId = this.requireStudent(user);
    const student = await this.prisma.studentProfile.findUnique({ where: { id: studentId } });
    if (!student) throw Errors.forbidden('Нет профиля ученика');
    const latest = await this.repo.latestConversation(user.userId, 'ONBOARDING');
    const draft = (latest?.contextSnapshot as OnboardingSnapshot | null)?.profileDraft;
    const profile: OnboardingProfile = draft ?? {
      interests: student.interests,
      goals: student.goals,
      weeklyHours: student.weeklyHours ?? 0,
      preferredFormats: student.preferredFormats,
      summary: student.aiProfileSummary ?? '',
    };
    const clubs = await this.catalog.listActiveClubCards(student.schoolId);
    const pool = clubs.length > 0 ? clubs : await this.catalog.listActiveClubCards(null);
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
    return { items };
  }

  async complete(user: AuthUser, body: CompleteOnboardingBody): Promise<MeDto> {
    const studentId = this.requireStudent(user);
    await this.identity.completeStudentOnboarding(studentId, body.profileDraft);
    for (const clubId of new Set(body.selectedClubIds)) {
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
    await this.contexts.invalidate(studentId);
    await this.events.emit('student.profile.updated', { studentId, at: new Date().toISOString() });
    await this.queue.enqueue(
      'ai',
      TRAJECTORY_JOB,
      { studentId },
      { jobId: `trajectory-${studentId}`, attempts: 2 },
    );
    this.log.info({ studentId, clubs: body.selectedClubIds.length }, 'онбординг завершён');
    return this.identity.getMe(user.userId, user.activeRole);
  }

  // ---------- внутреннее ----------

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
