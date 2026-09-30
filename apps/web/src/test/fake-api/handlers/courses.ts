/** Курсы и блоки: ученик (просмотр/прогресс), преподаватель (список/создание/структура), course-builder. */
import {
  type Assignment,
  type BlockAnswers,
  type Course,
  type CourseBlock,
  CompleteBlockBodySchema,
  CompleteBlockResultSchema,
  CourseProgressReportSchema,
  CreateCourseBodySchema,
  OpenBlockResultSchema,
  PublishCourseBodySchema,
  StudentBlockDetailSchema,
  StudentCourseDetailSchema,
  StudentCoursesListSchema,
  TeacherCourseDetailSchema,
  TeacherCoursesListSchema,
  toStudentBlock,
} from '@edu/contracts';
import { http } from 'msw';
import {
  assignmentBrief,
  courseProgressPercent,
  groupBrief,
  groupIdsOfStudent,
  groupsOfTeacher,
  studentBrief,
  studentIdsOfGroup,
} from '../demo';
import { apiError, apiUrl, authed, json, query, readBody } from '../lib';
import { db, studentOfUser, teacherOfUser } from '../state';

const modulesOf = (courseId: string) =>
  db.modules.filter((m) => m.courseId === courseId).sort((a, b) => a.order - b.order);
const blocksOf = (moduleId: string) =>
  db.blocks.filter((b) => b.moduleId === moduleId).sort((a, b) => a.order - b.order);
const allBlocksOf = (courseId: string) => modulesOf(courseId).flatMap((m) => blocksOf(m.id));

const progressOf = (studentId: string, blockId: string) =>
  db.blockProgress.find((p) => p.studentId === studentId && p.blockId === blockId);

/**
 * Курс для ученика: черновик — как несуществующий (404), курс чужой группы — 403. Как
 * `/student/courses`, который показывает только опубликованные курсы групп ученика.
 */
function studentCourse(studentId: string, courseId: string | undefined): Course | Response {
  const course = db.courses.find((c) => c.id === courseId);
  if (!course || course.status !== 'PUBLISHED') return apiError('NOT_FOUND', 'Курс не найден');
  if (!groupIdsOfStudent(studentId).includes(course.groupId)) {
    return apiError('FORBIDDEN', 'Курс не твоей группы');
  }
  return course;
}

/** Блок доступного ученику курса (иначе 404/403) и id его курса. */
function studentBlock(
  studentId: string,
  blockId: string,
): { block: CourseBlock; courseId: string } | Response {
  const block = db.blocks.find((b) => b.id === blockId);
  if (!block) return apiError('NOT_FOUND', 'Блок не найден');
  const courseId = db.modules.find((m) => m.id === block.moduleId)?.courseId;
  const course = studentCourse(studentId, courseId);
  if (course instanceof Response) return course;
  return { block, courseId: course.id };
}

/**
 * Балл QUIZ в процентах: вопрос засчитан, если выбранные варианты совпали с правильными как
 * множества. Ответов нет (UI пока шлёт `{}`) — прежнее поведение, 100.
 */
function quizScore(block: CourseBlock, answers: BlockAnswers | undefined): number | null {
  if (block.type !== 'QUIZ') return null;
  if (!answers) return 100;
  const chosen = answers as Record<string, unknown>;
  const { questions } = block.content;
  const correct = questions.filter((q) => {
    const picked = chosen[q.id];
    if (!Array.isArray(picked)) return false;
    const set = new Set(picked);
    return set.size === q.correctOptionIds.length && q.correctOptionIds.every((id) => set.has(id));
  }).length;
  return Math.round((correct / questions.length) * 100);
}

/** Блоки, которые при публикации становятся заданиями (как `ASSIGNABLE_BLOCK_TYPES` в API). */
const ASSIGNABLE_BLOCK_TYPES: readonly string[] = ['QUIZ', 'QUESTION', 'PRACTICE', 'HOMEWORK'];

/** Курс преподавателя (иначе 404/403). */
function ownedCourse(userId: string, courseId: string | undefined): Course | Response {
  const teacher = teacherOfUser(userId);
  const course = db.courses.find((c) => c.id === courseId);
  if (!course) return apiError('NOT_FOUND', 'Курс не найден');
  if (!teacher || course.teacherId !== teacher.id) return apiError('FORBIDDEN', 'Чужой курс');
  return course;
}

function teacherCourseDetail(courseId: string) {
  const course = db.courses.find((c) => c.id === courseId)!;
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    group: groupBrief(course.groupId),
    status: course.status,
    version: course.version,
    publishedAt: course.publishedAt,
    modules: modulesOf(course.id).map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      order: m.order,
      blocks: blocksOf(m.id),
    })),
  };
}

export const coursesHandlers = [
  http.get(
    apiUrl('/student/courses'),
    authed(
      ({ auth }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const groupIds = groupIdsOfStudent(student.id);
        const items = db.courses
          .filter((c) => c.status === 'PUBLISHED' && groupIds.includes(c.groupId))
          .map((c) => {
            const blocks = allBlocksOf(c.id);
            const completed = blocks.filter(
              (b) => progressOf(student.id, b.id)?.status === 'COMPLETED',
            );
            const next = blocks.find((b) => progressOf(student.id, b.id)?.status !== 'COMPLETED');
            return {
              id: c.id,
              title: c.title,
              group: groupBrief(c.groupId),
              progress: {
                percent: courseProgressPercent(c.id, student.id),
                completedBlocks: completed.length,
                totalBlocks: blocks.length,
              },
              nextBlock: next ? { id: next.id, title: next.title, type: next.type } : null,
            };
          });
        return json(StudentCoursesListSchema, { items });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ courseId: string }>(
    apiUrl('/student/courses/:courseId'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const course = studentCourse(student.id, params.courseId);
        if (course instanceof Response) return course;
        return json(StudentCourseDetailSchema, {
          id: course.id,
          title: course.title,
          description: course.description,
          group: groupBrief(course.groupId),
          modules: modulesOf(course.id).map((m) => ({
            id: m.id,
            title: m.title,
            order: m.order,
            blocks: blocksOf(m.id).map((b) => ({
              id: b.id,
              title: b.title,
              type: b.type,
              order: b.order,
              estimatedMinutes: b.estimatedMinutes,
              isRequired: b.isRequired,
              progress: progressOf(student.id, b.id)?.status ?? null,
            })),
          })),
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get<{ blockId: string }>(
    apiUrl('/student/blocks/:blockId'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const found = studentBlock(student.id, params.blockId);
        if (found instanceof Response) return found;
        const { block, courseId } = found;
        const assignment = db.assignments.find((a) => a.blockId === block.id);
        const progress = progressOf(student.id, block.id);
        return json(StudentBlockDetailSchema, {
          ...toStudentBlock(block),
          courseId,
          assignment: assignment ? assignmentBrief(assignment.id, student.id) : null,
          progress: progress
            ? { status: progress.status, attempts: progress.attempts, score: progress.score }
            : null,
        });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ blockId: string }>(
    apiUrl('/student/blocks/:blockId/open'),
    authed(
      ({ auth, params }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const found = studentBlock(student.id, params.blockId);
        if (found instanceof Response) return found;
        let progress = progressOf(student.id, params.blockId);
        if (!progress) {
          progress = {
            studentId: student.id,
            blockId: params.blockId,
            status: 'OPENED',
            openedAt: new Date().toISOString(),
            completedAt: null,
            attempts: 0,
            score: null,
          };
          db.blockProgress.push(progress);
        }
        return json(OpenBlockResultSchema, {
          progress: { status: progress.status, attempts: progress.attempts, score: progress.score },
        });
      },
      ['STUDENT'],
    ),
  ),

  http.post<{ blockId: string }>(
    apiUrl('/student/blocks/:blockId/complete'),
    authed(
      async ({ auth, params, request }) => {
        const student = studentOfUser(auth.user.id);
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const found = studentBlock(student.id, params.blockId);
        if (found instanceof Response) return found;
        const { block, courseId } = found;
        const body = await readBody(request, CompleteBlockBodySchema);
        if (!body.ok) return body.response;
        let progress = progressOf(student.id, block.id);
        if (!progress) {
          progress = {
            studentId: student.id,
            blockId: block.id,
            status: 'OPENED',
            openedAt: new Date().toISOString(),
            completedAt: null,
            attempts: 0,
            score: null,
          };
          db.blockProgress.push(progress);
        }
        progress.status = 'COMPLETED';
        progress.completedAt = new Date().toISOString();
        progress.attempts += 1;
        const score = quizScore(block, body.data.answers);
        progress.score = score;
        const blocks = allBlocksOf(courseId);
        return json(CompleteBlockResultSchema, {
          progress: { status: progress.status, attempts: progress.attempts, score: progress.score },
          score,
          courseProgress: {
            percent: courseProgressPercent(courseId, student.id),
            completedBlocks: blocks.filter(
              (b) => progressOf(student.id, b.id)?.status === 'COMPLETED',
            ).length,
            totalBlocks: blocks.length,
          },
        });
      },
      ['STUDENT'],
    ),
  ),

  http.get(
    apiUrl('/teacher/courses'),
    authed(
      ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const groupId = query(request).get('groupId');
        const groupIds = groupsOfTeacher(teacher.id).map((g) => g.id);
        const items = db.courses
          .filter((c) => groupIds.includes(c.groupId) && (!groupId || c.groupId === groupId))
          .map((c) => {
            const blocks = allBlocksOf(c.id);
            // Средний прогресс — по активным ученикам группы (ушедшие не занижают процент).
            const studentIds = studentIdsOfGroup(c.groupId);
            const avg = studentIds.length
              ? Math.round(
                  studentIds.reduce((sum, id) => sum + courseProgressPercent(c.id, id), 0) /
                    studentIds.length,
                )
              : 0;
            return {
              id: c.id,
              title: c.title,
              group: groupBrief(c.groupId),
              status: c.status,
              modulesCount: modulesOf(c.id).length,
              blocksCount: blocks.length,
              publishedAt: c.publishedAt,
              avgProgress: avg,
            };
          });
        return json(TeacherCoursesListSchema, { items });
      },
      ['TEACHER'],
    ),
  ),

  http.post(
    apiUrl('/teacher/courses'),
    authed(
      async ({ auth, request }) => {
        const teacher = teacherOfUser(auth.user.id);
        if (!teacher) return apiError('FORBIDDEN', 'Нет профиля преподавателя');
        const body = await readBody(request, CreateCourseBodySchema);
        if (!body.ok) return body.response;
        if (!groupsOfTeacher(teacher.id).some((g) => g.id === body.data.groupId)) {
          return apiError('FORBIDDEN', 'Чужая группа');
        }
        const course = {
          id: crypto.randomUUID(),
          groupId: body.data.groupId,
          teacherId: teacher.id,
          title: body.data.title,
          description: body.data.description ?? null,
          status: 'DRAFT' as const,
          version: 1,
          publishedAt: null,
          generationJobId: null,
        };
        db.courses.push(course);
        return json(TeacherCourseDetailSchema, teacherCourseDetail(course.id));
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ courseId: string }>(
    apiUrl('/teacher/courses/:courseId'),
    authed(
      ({ auth, params }) => {
        const teacher = teacherOfUser(auth.user.id);
        const course = db.courses.find((c) => c.id === params.courseId);
        if (!course) return apiError('NOT_FOUND', 'Курс не найден');
        if (!teacher || course.teacherId !== teacher.id) return apiError('FORBIDDEN', 'Чужой курс');
        return json(TeacherCourseDetailSchema, teacherCourseDetail(course.id));
      },
      ['TEACHER'],
    ),
  ),

  // Публикация: курс виден ученикам группы, блоки-задания становятся заданиями (идемпотентно).
  http.post<{ courseId: string }>(
    apiUrl('/teacher/courses/:courseId/publish'),
    authed(
      async ({ auth, params, request }) => {
        const course = ownedCourse(auth.user.id, params.courseId);
        if (course instanceof Response) return course;
        const body = await readBody(request, PublishCourseBodySchema);
        if (!body.ok) return body.response;
        if (course.status === 'ARCHIVED') return apiError('BUSINESS_RULE', 'Курс в архиве');
        for (const block of allBlocksOf(course.id)) {
          if (!ASSIGNABLE_BLOCK_TYPES.includes(block.type)) continue;
          if (db.assignments.some((a) => a.blockId === block.id)) continue;
          db.assignments.push({
            id: crypto.randomUUID(),
            groupId: course.groupId,
            teacherId: course.teacherId,
            courseId: course.id,
            blockId: block.id,
            studentIds: [],
            title: block.title,
            description: null,
            type: block.type as Assignment['type'],
            dueAt: null,
            maxScore: 100,
            allowedAttempts: null,
            publishedAt: new Date().toISOString(),
          });
        }
        course.status = 'PUBLISHED';
        course.publishedAt ??= new Date().toISOString();
        return json(TeacherCourseDetailSchema, teacherCourseDetail(course.id));
      },
      ['TEACHER'],
    ),
  ),

  http.post<{ courseId: string }>(
    apiUrl('/teacher/courses/:courseId/archive'),
    authed(
      ({ auth, params }) => {
        const course = ownedCourse(auth.user.id, params.courseId);
        if (course instanceof Response) return course;
        course.status = 'ARCHIVED';
        return json(TeacherCourseDetailSchema, teacherCourseDetail(course.id));
      },
      ['TEACHER'],
    ),
  ),

  http.get<{ courseId: string }>(
    apiUrl('/teacher/courses/:courseId/progress'),
    authed(
      ({ auth, params }) => {
        const course = ownedCourse(auth.user.id, params.courseId);
        if (course instanceof Response) return course;
        const blocks = allBlocksOf(course.id);
        const students = studentIdsOfGroup(course.groupId).map((studentId) => {
          const done = blocks
            .map((b) => progressOf(studentId, b.id))
            .filter((p) => p?.status === 'COMPLETED');
          const last = done
            .map((p) => p?.completedAt)
            .filter((at): at is string => !!at)
            .sort()
            .at(-1);
          return {
            student: studentBrief(studentId),
            percent: courseProgressPercent(course.id, studentId),
            completedBlocks: done.length,
            lastActivityAt: last ?? null,
          };
        });
        return json(CourseProgressReportSchema, { students });
      },
      ['TEACHER'],
    ),
  ),
];
