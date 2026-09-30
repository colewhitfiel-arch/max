/**
 * Раздел тура «Конспект → курс» делает всё по-настоящему, через тот же API, что и экраны:
 * Мария загружает пример конспекта и запускает генерацию, ИИ собирает черновик, курс
 * публикуется для группы Алексея, Алексей проходит его. Прошлый демо-курс с тем же названием
 * убирается в архив — на общем стенде у демо-группы не копятся одинаковые курсы.
 */
import type { GenerationStage } from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { uploadFile } from '@/entities/file';
import { sampleMaterialFile } from '@/features/upload-file';
import { api, call } from '@/shared/api/client';
import { isApiClientError } from '@/shared/api/errors';
import { queryClient } from '@/shared/api/query-client';
import { queryKeys } from '@/shared/api/query-keys';
import { i18n } from '@/shared/i18n';

/** Что тур уже сделал в этом прогоне: id задачи, курса и шагов курса для экранов ученика. */
export interface DemoContext {
  jobId?: string;
  courseId?: string;
  /** Первый шаг курса с теорией — экран плеера. */
  lessonId?: string;
  /** Первый тест курса — мгновенная проверка. */
  quizId?: string;
}

/** Группа «Робототехника»: её ведёт Мария, в ней учится Алексей. */
export const DEMO_COURSE_GROUP_ID = DEMO_IDS.groups.roboticsA;

const POLL_MS = 2_000;
/** Сколько ждём черновик: GigaChat на бесплатном тарифе пишет курс минуту-две. */
export const DRAFT_TIMEOUT_MS = 6 * 60_000;
const FINISHED: readonly GenerationStage[] = ['READY', 'ACCEPTED'];
const BROKEN: readonly GenerationStage[] = ['FAILED', 'CANCELLED'];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Название демо-курса — по нему находятся и архивируются курсы прошлых прогонов. */
export function demoCourseTitle(): string {
  return i18n.t('demo:pipeline.courseTitle');
}

/** Последняя уже собранная демо-задача (черновик готов или курс принят); null — такой нет. */
async function latestDemoJobId(): Promise<string | null> {
  const page = await call(api.courseBuilder.listGenerationJobs({ query: {} }));
  const title = demoCourseTitle();
  const job = page.items.find(
    (item) => item.targetTitle === title && FINISHED.includes(item.stage),
  );
  return job?.id ?? null;
}

/**
 * Загрузить пример конспекта от имени Марии и запустить генерацию курса для её группы. Лимит
 * генераций в час общий у всех зрителей тура (демо-преподаватель один на стенд): упёрлись в него —
 * показываем последний уже собранный демо-курс, а не обрываем тур.
 */
export async function generateDemoCourse(): Promise<string> {
  try {
    const file = await uploadFile({ file: sampleMaterialFile(), purpose: 'MATERIAL' });
    const job = await call(
      api.courseBuilder.createGenerationJob({
        body: {
          groupId: DEMO_COURSE_GROUP_ID,
          materialIds: [file.id],
          targetTitle: demoCourseTitle(),
        },
      }),
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.teacher });
    return job.id;
  } catch (error) {
    if (!isApiClientError(error) || error.code !== 'RATE_LIMITED') throw error;
    const fallback = await latestDemoJobId();
    if (!fallback) throw error;
    return fallback;
  }
}

/** Дождаться черновика: READY — дальше, ошибка генерации — исключение с её текстом. */
export async function waitForDraft(jobId: string, isCancelled: () => boolean): Promise<void> {
  const deadline = Date.now() + DRAFT_TIMEOUT_MS;
  while (!isCancelled() && Date.now() < deadline) {
    const job = await call(api.courseBuilder.getGenerationJob({ params: { jobId } }));
    if (FINISHED.includes(job.stage)) return;
    if (BROKEN.includes(job.stage))
      throw new Error(job.error ?? i18n.t('demo:pipeline.generationFailed'));
    await sleep(POLL_MS);
  }
  if (!isCancelled()) throw new Error(i18n.t('demo:pipeline.generationTimeout'));
}

/**
 * Принять черновик и опубликовать курс для группы; курсы прошлых прогонов с тем же названием —
 * в архив. Возвращает id курса и шагов, которые тур покажет глазами ученика.
 */
export async function publishDemoCourse(
  jobId: string,
): Promise<Required<Omit<DemoContext, 'jobId'>>> {
  const { courseId } = await call(api.courseBuilder.acceptGenerationJob({ params: { jobId } }));
  const course = await call(
    api.courses.publishCourse({ params: { courseId }, body: { assignments: [] } }),
  );
  const list = await call(
    api.courses.listTeacherCourses({ query: { groupId: DEMO_COURSE_GROUP_ID } }),
  );
  for (const old of list.items) {
    if (old.id === courseId || old.status === 'ARCHIVED' || old.title !== course.title) continue;
    await call(api.courses.archiveCourse({ params: { courseId: old.id } }));
  }
  await queryClient.invalidateQueries();
  const blocks = course.modules.flatMap((module) => module.blocks);
  const lesson = blocks.find((block) => block.type === 'TEXT') ?? blocks[0];
  const quiz = blocks.find((block) => block.type === 'QUIZ') ?? lesson;
  return { courseId, lessonId: lesson?.id ?? '', quizId: quiz?.id ?? '' };
}
