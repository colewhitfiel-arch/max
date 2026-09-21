/** Курсы и блоки: ученик (просмотр/прогресс), преподаватель (список/создание/структура), course-builder. */
import {
  type CourseBlock,
  CompleteBlockBodySchema,
  CompleteBlockResultSchema,
  CreateCourseBodySchema,
  OpenBlockResultSchema,
  StudentBlockDetailSchema,
  StudentCourseDetailSchema,
  StudentCoursesListSchema,
  TeacherCourseDetailSchema,
  TeacherCoursesListSchema,
} from '@edu/contracts';
import { http } from 'msw';
import {
  assignmentBrief,
  courseProgressPercent,
  groupBrief,
  groupIdsOfStudent,
  groupsOfTeacher,
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

/** QUIZ без правильных ответов и пояснений. */
function forStudent(block: CourseBlock) {
  if (block.type !== 'QUIZ') return block;
  return {
    ...block,
    content: {
      passScore: block.content.passScore,
      questions: block.content.questions.map(
        ({ correctOptionIds: _c, explanation: _e, ...q }) => q,
      ),
    },
  };
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
        const course = db.courses.find((c) => c.id === params.courseId);
        if (!course) return apiError('NOT_FOUND', 'Курс не найден');
        if (!student || !groupIdsOfStudent(student.id).includes(course.groupId)) {
          return apiError('FORBIDDEN', 'Курс не твоей группы');
        }
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
        const block = db.blocks.find((b) => b.id === params.blockId);
        if (!block) return apiError('NOT_FOUND', 'Блок не найден');
        const module = db.modules.find((m) => m.id === block.moduleId)!;
        if (!student) return apiError('FORBIDDEN', 'Нет профиля ученика');
        const assignment = db.assignments.find((a) => a.blockId === block.id);
        const progress = progressOf(student.id, block.id);
        return json(StudentBlockDetailSchema, {
          ...forStudent(block),
          courseId: module.courseId,
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
        if (!db.blocks.some((b) => b.id === params.blockId))
          return apiError('NOT_FOUND', 'Блок не найден');
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
        const block = db.blocks.find((b) => b.id === params.blockId);
        if (!block) return apiError('NOT_FOUND', 'Блок не найден');
        const body = await readBody(request, CompleteBlockBodySchema);
        if (!body.ok) return body.response;
        const module = db.modules.find((m) => m.id === block.moduleId)!;
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
        const score = block.type === 'QUIZ' ? 100 : null;
        progress.score = score;
        const blocks = allBlocksOf(module.courseId);
        return json(CompleteBlockResultSchema, {
          progress: { status: progress.status, attempts: progress.attempts, score: progress.score },
          score,
          courseProgress: {
            percent: courseProgressPercent(module.courseId, student.id),
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
            const studentIds = db.enrollments
              .filter((e) => e.groupId === c.groupId)
              .map((e) => e.studentId);
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
];
