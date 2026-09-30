/**
 * Course-builder: задачи генерации с имитацией стадий по таймеру (EXTRACTING → OUTLINING →
 * GENERATING → ASSEMBLING → READY), база знаний из атомов и черновик курса из темы/файлов.
 */
import {
  AcceptGenerationJobResultSchema,
  type Assignment,
  type CourseDraft,
  type CourseGenerationJob,
  CreateGenerationJobBodySchema,
  GenerationJobDtoSchema,
  GenerationJobListItemSchema,
  type KnowledgeBase,
  UpdateGenerationDraftBodySchema,
  paginated,
} from '@edu/contracts';
import { http } from 'msw';
import { groupsOfTeacher, studentIdsOfGroup } from '../demo';
import { apiError, apiUrl, authed, json, readBody } from '../lib';
import { db, teacherOfUser } from '../state';
import { fileDto } from './files';

const STAGE_DELAY_MS = 700;

/** Блоки, которые при публикации становятся заданиями (как `ASSIGNABLE_BLOCK_TYPES` в API). */
const ASSIGNABLE_BLOCK_TYPES: readonly string[] = ['QUIZ', 'QUESTION', 'PRACTICE', 'HOMEWORK'];

type Job = CourseGenerationJob;

function atomsFrom(text: string, source: string): KnowledgeBase['atoms'] {
  return text
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[А-ЯA-Z])/)
    .map((s) =>
      s
        .replace(/^#+\s*/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => s.length > 15)
    .slice(0, 24)
    .map((atomText, i) => ({ id: i + 1, text: atomText, source }));
}

function knowledgeFor(job: Job): KnowledgeBase {
  const source = job.topic ?? job.materials.map((m) => m.fileName).join(', ');
  const fileTexts = job.materials.map((m) => db.files.find((f) => f.id === m.id)?.text ?? '');
  // Байты File из jsdom fetch в Node не передаёт (в теле — «[object File]»): нет атомов из
  // файла — работаем по заготовке темы, как если бы в файле был только заголовок.
  const raw =
    atomsFrom(fileTexts.join(' '), 'файл').length > 0
      ? fileTexts.join('\n\n')
      : [
          `${source}. Это тема занятия: важно понять, зачем она нужна и где применяется.`,
          `Ключевое правило: действуй по шагам и проверяй результат после каждого шага.`,
          `Типичная ошибка — пропускать проверку и торопиться с выводами.`,
          `Пример: разбери простой случай, затем усложни условие и повтори.`,
          `Практика: примени правило на своём примере и опиши, что получилось.`,
          `Итог: сформулируй своими словами, что нового узнал.`,
        ].join('\n\n');
  const atoms = atomsFrom(raw, job.topic ? 'topic' : (job.materials[0]?.fileName ?? 'файл'));
  const nodes: KnowledgeBase['nodes'] = [];
  for (let i = 0; i < atoms.length; i += 2) {
    const pair = atoms.slice(i, i + 2);
    nodes.push({
      id: `n${nodes.length + 1}`,
      title: pair[0]!.text.split(/[.:]/)[0]!.slice(0, 50),
      statement: pair[0]!.text,
      type: (['CONCEPT', 'FACT', 'PROCEDURE', 'EXAMPLE'] as const)[nodes.length % 4]!,
      atomIds: pair.map((a) => a.id),
      importance: nodes.length % 3 === 0 ? 3 : 2,
      misconceptions: [],
    });
  }
  const plan: KnowledgeBase['plan'] = [];
  for (let i = 0; i < nodes.length; i += 3) {
    const group = nodes.slice(i, i + 3);
    plan.push({ title: group[0]!.title, nodeIds: group.map((n) => n.id) });
  }
  // Одно ДЗ — ровно один модуль (как `planModules(..., { maxModules: 1 })` на сервере).
  if (job.target === 'HOMEWORK' && plan.length > 1) plan.splice(1);
  return {
    atoms,
    nodes,
    plan,
    stats: { atomsTotal: atoms.length, atomsCited: atoms.length, coverage: 1, nodesRejected: 0 },
  };
}

function draftFor(job: Job, knowledge: KnowledgeBase): CourseDraft {
  return {
    title: job.targetTitle ?? job.topic?.split(/[.:]/)[0]?.slice(0, 60) ?? 'Курс из материалов',
    description: `Курс сгенерирован ${job.topic ? 'по описанию темы' : 'из материалов преподавателя'}.`,
    modules: knowledge.plan.map((module) => {
      const nodes = module.nodeIds.map((id) => knowledge.nodes.find((n) => n.id === id)!);
      const first = nodes[0]!;
      return {
        title: module.title,
        summary: `Урок «${module.title}»: ${nodes.map((n) => n.title).join(', ')}.`,
        blocks: [
          {
            type: 'TEXT' as const,
            title: first.title,
            content: {
              markdown: `## ${first.title}\n\n${nodes.map((n) => n.statement).join('\n\n')}`,
            },
            estimatedMinutes: 5,
            isRequired: true,
          },
          {
            type: 'QUIZ' as const,
            title: `Проверь себя: ${first.title}`,
            content: {
              passScore: 60,
              questions: [
                {
                  id: 'q1',
                  text: `Что верно про «${first.title}»?`,
                  options: [
                    { id: 'a', text: first.statement.slice(0, 80) },
                    { id: 'b', text: 'Это не относится к теме' },
                    { id: 'c', text: 'Это всегда неверно' },
                    { id: 'd', text: 'Ничего из перечисленного' },
                  ],
                  correctOptionIds: ['a'],
                  multiple: false,
                },
              ],
            },
            estimatedMinutes: 3,
            isRequired: true,
          },
          {
            type: 'INTERACTIVE' as const,
            title: 'Вставь пропущенное',
            content: {
              kind: 'FILL_GAPS' as const,
              data: { text: `Ключевое понятие урока — {{${first.title}}}.` },
            },
            estimatedMinutes: 4,
            isRequired: false,
          },
          {
            type: 'PRACTICE' as const,
            title: `Практика: ${first.title}`,
            content: {
              instructions: `Примени «${first.title}» на своём примере и опиши результат.`,
              submissionType: 'TEXT' as const,
            },
            estimatedMinutes: 15,
            isRequired: true,
          },
        ],
      };
    }),
  };
}

const jobOf = (teacherId: string, jobId: string) =>
  db.generationJobs.find((j) => j.id === jobId && j.teacherId === teacherId);

/** Имитация пайплайна: стадии по таймеру; отмена прерывает. */
function simulate(job: Job) {
  const steps: Array<[Job['stage'], number]> = [
    ['EXTRACTING', 10],
    ['OUTLINING', 40],
    ['GENERATING', 75],
    ['ASSEMBLING', 92],
    ['READY', 100],
  ];
  let i = 0;
  const tick = () => {
    if (job.stage === 'CANCELLED') return;
    const [stage, progress] = steps[i]!;
    job.stage = stage;
    job.progress = progress;
    if (stage === 'EXTRACTING') job.startedAt = new Date().toISOString();
    if (stage === 'OUTLINING') job.knowledge = knowledgeFor(job);
    if (stage === 'READY') {
      job.draft = draftFor(job, job.knowledge!);
      job.finishedAt = new Date().toISOString();
      return;
    }
    i += 1;
    setTimeout(tick, STAGE_DELAY_MS);
  };
  setTimeout(tick, STAGE_DELAY_MS / 2);
}

export const courseBuilderHandlers = [
  http.post(
    apiUrl('/teacher/course-builder/jobs'),
    authed(
      async ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const body = await readBody(request, CreateGenerationJobBodySchema);
        if (!body.ok) return body.response;
        if (!groupsOfTeacher(teacher.id).some((g) => g.id === body.data.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        // Как `listOwnedMaterials` в API: свой файл, purpose MATERIAL, загрузка подтверждена.
        const materials: ReturnType<typeof fileDto>[] = [];
        for (const id of body.data.materialIds ?? []) {
          const file = db.files.find((f) => f.id === id);
          if (!file || file.ownerUserId !== auth.user.id)
            return apiError('NOT_FOUND', 'Файл материала не найден');
          if (file.purpose !== 'MATERIAL')
            return apiError('VALIDATION', 'Файл не является материалом курса');
          if (!file.confirmed)
            return apiError('BUSINESS_RULE', `Файл «${file.fileName}» ещё не загружен`);
          materials.push(fileDto(file));
        }
        // Курс дополняем только свой и только в той же группе (как `assertAppendable`).
        if (body.data.targetCourseId) {
          const course = db.courses.find((c) => c.id === body.data.targetCourseId);
          if (!course || course.teacherId !== teacher.id)
            return apiError('NOT_FOUND', 'Курс не найден');
          if (course.groupId !== body.data.groupId)
            return apiError('BUSINESS_RULE', 'Курс относится к другой группе');
          if (course.status === 'ARCHIVED')
            return apiError('BUSINESS_RULE', 'Курс в архиве — его не дополнить');
        }
        const roster = studentIdsOfGroup(body.data.groupId);
        const targets = [...new Set(body.data.studentIds ?? [])];
        if (targets.some((id) => !roster.includes(id)))
          return apiError('BUSINESS_RULE', 'Среди выбранных есть ученики не из этой группы');
        const job: Job = {
          id: crypto.randomUUID(),
          teacherId: teacher.id,
          groupId: body.data.groupId,
          courseId: null,
          materials,
          instructions: body.data.instructions ?? null,
          targetTitle: body.data.targetTitle ?? null,
          sourceKind: materials.length > 0 ? 'MATERIALS' : 'TOPIC',
          target: body.data.target ?? 'COURSE',
          targetCourseId: body.data.targetCourseId ?? null,
          studentIds: targets,
          dueAt: body.data.dueAt ?? null,
          topic: body.data.topic ?? null,
          knowledge: null,
          stage: 'QUEUED',
          progress: 0,
          draft: null,
          error: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
        };
        db.generationJobs.unshift(job);
        simulate(job);
        return json(GenerationJobDtoSchema, job);
      },
      ['TEACHER'],
    ),
  ),

  http.get(
    apiUrl('/teacher/course-builder/jobs'),
    authed(
      ({ auth }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        return json(paginated(GenerationJobListItemSchema), {
          items: db.generationJobs
            .filter((j) => j.teacherId === teacher.id)
            .map(({ draft: _draft, knowledge: _knowledge, ...job }) => job),
        });
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ jobId: string }>(
    apiUrl('/teacher/course-builder/jobs/:jobId'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const job = teacher && jobOf(teacher.id, params.jobId);
        if (!job) return apiError('NOT_FOUND', 'Задача не найдена');
        return json(GenerationJobDtoSchema, job);
      },
      ['TEACHER'],
    ),
  ),

  http.put<{ jobId: string }>(
    apiUrl('/teacher/course-builder/jobs/:jobId/draft'),
    authed(
      async ({ auth, params, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        const job = teacher && jobOf(teacher.id, params.jobId);
        if (!job) return apiError('NOT_FOUND', 'Задача не найдена');
        if (job.stage !== 'READY')
          return apiError('BUSINESS_RULE', 'Черновик можно править только до принятия');
        const body = await readBody(request, UpdateGenerationDraftBodySchema);
        if (!body.ok) return body.response;
        job.draft = body.data.draft;
        return json(GenerationJobDtoSchema, job);
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ jobId: string }>(
    apiUrl('/teacher/course-builder/jobs/:jobId/accept'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const job = teacher && jobOf(teacher.id, params.jobId);
        if (!job) return apiError('NOT_FOUND', 'Задача не найдена');
        const settled = job.courseId ?? (job.stage === 'ACCEPTED' ? job.targetCourseId : null);
        if (settled) {
          return json(AcceptGenerationJobResultSchema, {
            courseId: settled,
            assignmentsCreated: 0,
          });
        }
        if (job.stage !== 'READY' || !job.draft)
          return apiError('BUSINESS_RULE', 'Черновик ещё не готов');

        // Дополняем существующий курс или создаём новый — как `appendFromDraft`/`createFromDraft`.
        const appendTo = job.targetCourseId
          ? db.courses.find((c) => c.id === job.targetCourseId)
          : undefined;
        const courseId = appendTo?.id ?? crypto.randomUUID();
        if (!appendTo) {
          db.courses.push({
            id: courseId,
            groupId: job.groupId,
            teacherId: teacher.id,
            title: job.draft.title,
            description: job.draft.description ?? null,
            status: 'DRAFT',
            version: 1,
            publishedAt: null,
            generationJobId: job.id,
          });
        }
        const startOrder = db.modules.filter((m) => m.courseId === courseId).length;
        const newBlocks: Array<{ id: string; type: string; title: string }> = [];
        job.draft.modules.forEach((module, index) => {
          const moduleId = crypto.randomUUID();
          db.modules.push({
            id: moduleId,
            courseId,
            order: startOrder + index,
            title: module.title,
            summary: module.summary ?? null,
          });
          module.blocks.forEach((block, blockOrder) => {
            const blockId = crypto.randomUUID();
            db.blocks.push({
              ...block,
              id: blockId,
              moduleId,
              order: blockOrder,
              estimatedMinutes: block.estimatedMinutes ?? null,
              isRequired: block.isRequired ?? true,
            });
            newBlocks.push({ id: blockId, type: block.type, title: block.title });
          });
        });

        // ДЗ и дополнение живого курса публикуются сразу: блоки-задания становятся Assignment.
        const course = db.courses.find((c) => c.id === courseId)!;
        const publishNow =
          job.target === 'HOMEWORK' || (!!appendTo && course.status === 'PUBLISHED');
        let assignmentsCreated = 0;
        if (publishNow) {
          for (const block of newBlocks) {
            if (!ASSIGNABLE_BLOCK_TYPES.includes(block.type)) continue;
            db.assignments.push({
              id: crypto.randomUUID(),
              groupId: job.groupId,
              teacherId: teacher.id,
              courseId,
              blockId: block.id,
              studentIds: job.studentIds ?? [],
              title: block.title,
              description: null,
              type: block.type as Assignment['type'],
              dueAt: job.dueAt ?? null,
              maxScore: 100,
              allowedAttempts: null,
              publishedAt: new Date().toISOString(),
            });
            assignmentsCreated += 1;
          }
          course.status = 'PUBLISHED';
          course.publishedAt ??= new Date().toISOString();
        }

        job.stage = 'ACCEPTED';
        job.targetCourseId = courseId;
        if (!appendTo) job.courseId = courseId;
        job.finishedAt = new Date().toISOString();
        return json(AcceptGenerationJobResultSchema, { courseId, assignmentsCreated });
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ jobId: string }>(
    apiUrl('/teacher/course-builder/jobs/:jobId/cancel'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const job = teacher && jobOf(teacher.id, params.jobId);
        if (!job) return apiError('NOT_FOUND', 'Задача не найдена');
        if (['READY', 'ACCEPTED', 'FAILED', 'CANCELLED'].includes(job.stage)) {
          return apiError('BUSINESS_RULE', 'Задача уже завершена');
        }
        job.stage = 'CANCELLED';
        job.finishedAt = new Date().toISOString();
        return json(GenerationJobDtoSchema, job);
      },
      ['TEACHER'],
    ),
  ),
];
