import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AiService,
  TrajectoryResultSchema,
  buildRequest,
  renderClubsForPrompt,
  trajectoryPrompt,
} from '@edu/ai';
import type { TrajectoryContent, TrajectoryDto } from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { CatalogService } from '../catalog/catalog.service';
import { CoursesService } from '../courses/courses.service';
import { AiRepository } from './ai.repository';
import { StudentContextBuilder } from './context-builder';

export const TRAJECTORY_JOB = 'trajectory.build';

/** Персональная траектория (F5): строится в фоне по StudentContext, кэш по sourceHash. */
@Injectable()
export class TrajectoryService {
  private readonly log;

  constructor(
    private readonly repo: AiRepository,
    private readonly contexts: StudentContextBuilder,
    private readonly catalog: CatalogService,
    private readonly courses: CoursesService,
    private readonly ai: AiService,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'ai.trajectory' });
  }

  async get(user: AuthUser): Promise<TrajectoryDto | null> {
    const studentId = this.requireStudent(user);
    const row = await this.repo.latestTrajectory(studentId);
    if (!row) return null;
    return {
      id: row.id,
      studentId: row.studentId,
      content: row.content as TrajectoryContent,
      generatedAt: row.generatedAt.toISOString(),
    };
  }

  /** Ручной пересчёт: не чаще раза в сутки, выполняется job'ом. */
  async refresh(user: AuthUser): Promise<{ queued: true }> {
    const studentId = this.requireStudent(user);
    const used = await this.kv.incr(`ai:trajectory:refresh:${studentId}`, 86_400);
    if (used > 1) throw Errors.rateLimited('Траекторию можно обновлять раз в сутки');
    await this.contexts.invalidate(studentId);
    await this.queue.enqueue(
      'ai',
      TRAJECTORY_JOB,
      { studentId },
      { jobId: `trajectory-${studentId}`, attempts: 2 },
    );
    return { queued: true };
  }

  /** Фоновая задача: контекст → модель → новая версия, если данные изменились. */
  async build(studentId: string, options: { force?: boolean } = {}): Promise<void> {
    const bundle = await this.contexts.get(studentId, { fresh: true });
    if (!bundle) return;
    const [clubs, courses] = await Promise.all([
      this.catalog.listActiveClubCards(bundle.schoolId),
      this.courses.listStudentCourseProgress(studentId),
    ]);
    const clubsText = renderClubsForPrompt(clubs);
    const coursesText = courses
      .map((c) => `- id: ${c.courseId} | ${c.title} | прогресс ${c.percent}%`)
      .join('\n');
    const sourceHash = createHash('sha256')
      .update(bundle.text)
      .update(clubsText)
      .update(coursesText)
      .digest('hex');
    const latest = await this.repo.latestTrajectory(studentId);
    if (!options.force && latest?.sourceHash === sourceHash) {
      this.log.debug({ studentId }, 'траектория актуальна');
      return;
    }
    const request = buildRequest(
      trajectoryPrompt,
      { context: bundle.text, clubsText, coursesText },
      { metadata: { userId: bundle.userId } },
    );
    const { data } = await this.ai.chatJson(request, TrajectoryResultSchema);
    const knownClubs = new Set(clubs.map((c) => c.id));
    const knownCourses = new Set(courses.map((c) => c.courseId));
    const content: TrajectoryContent = {
      summary: data.summary,
      strengths: data.strengths,
      growthAreas: data.growthAreas,
      recommendations: data.recommendations.map((r) => ({
        title: r.title,
        why: r.why,
        ...(r.clubId && knownClubs.has(r.clubId) ? { clubId: r.clubId } : {}),
        ...(r.courseId && knownCourses.has(r.courseId) ? { courseId: r.courseId } : {}),
      })),
      nextSteps: data.nextSteps,
    };
    await this.repo.createTrajectory({
      studentId,
      content,
      promptId: trajectoryPrompt.key,
      sourceHash,
    });
    await this.contexts.invalidate(studentId);
    this.log.info(
      { studentId, recommendations: content.recommendations.length },
      'траектория обновлена',
    );
  }

  private requireStudent(user: AuthUser): string {
    if (user.activeRole !== 'STUDENT' || !user.profileId)
      throw Errors.forbidden('Нет профиля ученика');
    return user.profileId;
  }
}
