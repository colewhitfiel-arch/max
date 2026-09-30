/**
 * Сценарий демонстрационного режима: по шагу на функцию — сначала «Конспект → курс» (главный
 * сценарий: преподаватель загружает конспект, ученик проходит готовый курс), затем ученик →
 * родитель → преподаватель. Каждый шаг — кто должен быть в сессии (демо-пользователь из
 * фикстур), какой экран открыть и какой элемент подсветить (`data-tour` на экране). Тексты —
 * `demo:steps.<id>.title|text`. Идентификаторы в путях — детерминированные id демо-мира
 * (seed = фикстуры) или то, что тур создал в этом прогоне (`DemoContext`).
 */
import type { Role } from '@edu/contracts';
import { DEMO_IDS, demoUsers } from '@edu/contracts/fixtures';
import type { DemoContext } from './pipeline';

export interface DemoPersona {
  userId: string;
  maxUserId: string;
  role: Role;
}

/** Демо-пользователи тура: у каждого одна роль, в которой он входит. */
export const DEMO_PERSONAS = {
  /** Даша: онбординг не пройден — показываем знакомство с ИИ. */
  newStudent: {
    userId: demoUsers.student2.id,
    maxUserId: demoUsers.student2.maxUserId,
    role: 'STUDENT',
  },
  /** Алексей: онбординг пройден, есть посещения, задания и сдача. */
  student: {
    userId: demoUsers.student1.id,
    maxUserId: demoUsers.student1.maxUserId,
    role: 'STUDENT',
  },
  /** Ольга: мама Алексея и Даши. */
  parent: {
    userId: demoUsers.parent.id,
    maxUserId: demoUsers.parent.maxUserId,
    role: 'PARENT',
  },
  /** Мария: ведёт обе группы. */
  teacher: {
    userId: demoUsers.teacher.id,
    maxUserId: demoUsers.teacher.maxUserId,
    role: 'TEACHER',
  },
} as const satisfies Record<string, DemoPersona>;

export type DemoPersonaKey = keyof typeof DEMO_PERSONAS;
export type DemoSection = 'intro' | 'course' | 'student' | 'parent' | 'teacher';

/** Настоящие действия тура перед показом шага (один раз за прогон, результат — в `DemoContext`). */
export type DemoAction = 'generateCourse' | 'publishCourse';

export interface DemoStep {
  /** Ключ текстов: `demo:steps.<id>.title` и `demo:steps.<id>.text`. */
  id: string;
  section: DemoSection;
  /** Кто должен быть в сессии; нет — сессию не трогаем. */
  persona?: DemoPersonaKey;
  /**
   * Экран шага; нет — остаёмся на текущем. Функция — экран того, что тур создал в этом прогоне
   * (задача генерации, курс); `undefined` — создать не удалось, остаёмся на текущем.
   */
  path?: string | ((context: DemoContext) => string | undefined);
  /** Значение `data-tour` подсвечиваемого элемента; нет — карточка по центру. */
  target?: string;
  /**
   * Куда карточка, если цель выше экрана и рядом не влезла: у чата — наверх, чтобы новые реплики
   * у поля ввода оставались видны. По умолчанию — вниз.
   */
  overlaySide?: 'top' | 'bottom';
  /** Что сделать до показа шага: загрузить конспект и запустить генерацию, опубликовать курс. */
  action?: DemoAction;
  /** Ждать, пока ИИ соберёт черновик курса (до нескольких минут на GigaChat). */
  waitFor?: 'draftReady';
  /** Карточка шага показывает живой прогресс генерации и сама идёт дальше, когда черновик готов. */
  live?: 'generation';
}

/** Экран шага с учётом того, что тур уже создал. */
export function stepPath(step: DemoStep, context: DemoContext): string | undefined {
  return typeof step.path === 'function' ? step.path(context) : step.path;
}

const jobPath = ({ jobId }: DemoContext) =>
  jobId ? `/teacher/course-builder/${jobId}` : undefined;
const teacherCoursePath = ({ courseId }: DemoContext) =>
  courseId ? `/teacher/courses/${courseId}` : undefined;

const alexey = DEMO_IDS.students.alexey;

export const DEMO_STEPS: readonly DemoStep[] = [
  { id: 'welcome', section: 'intro' },

  // Конспект → курс: всё по-настоящему, через API
  {
    id: 'courseUpload',
    section: 'course',
    persona: 'teacher',
    path: '/teacher/course-builder',
    target: 'course-builder',
  },
  {
    id: 'courseGenerate',
    section: 'course',
    persona: 'teacher',
    action: 'generateCourse',
    path: jobPath,
    target: 'generation-progress',
    live: 'generation',
  },
  {
    id: 'courseDraft',
    section: 'course',
    persona: 'teacher',
    waitFor: 'draftReady',
    path: jobPath,
    target: 'generation-draft',
  },
  {
    id: 'coursePublish',
    section: 'course',
    persona: 'teacher',
    action: 'publishCourse',
    path: teacherCoursePath,
    target: 'course-status',
  },
  {
    id: 'courseStudent',
    section: 'course',
    persona: 'student',
    path: ({ courseId }) => (courseId ? `/student/courses/${courseId}` : undefined),
    target: 'course-progress',
  },
  {
    id: 'courseLesson',
    section: 'course',
    persona: 'student',
    path: ({ lessonId }) => (lessonId ? `/student/blocks/${lessonId}` : undefined),
    target: 'block-player',
  },
  {
    id: 'courseQuiz',
    section: 'course',
    persona: 'student',
    path: ({ quizId }) => (quizId ? `/student/blocks/${quizId}` : undefined),
    target: 'quiz-answer',
  },
  {
    id: 'courseProgress',
    section: 'course',
    persona: 'teacher',
    path: teacherCoursePath,
    target: 'course-progress',
  },

  // Ученик
  {
    id: 'onboarding',
    section: 'student',
    persona: 'newStudent',
    path: '/onboarding',
    target: 'chat',
    overlaySide: 'top',
  },
  {
    id: 'studentStats',
    section: 'student',
    persona: 'student',
    path: '/student',
    target: 'student-stats',
  },
  {
    id: 'studentWeek',
    section: 'student',
    persona: 'student',
    path: '/student',
    target: 'student-week',
  },
  {
    id: 'studentSchedule',
    section: 'student',
    persona: 'student',
    path: '/student',
    target: 'day-schedule',
  },
  {
    id: 'studentTutor',
    section: 'student',
    persona: 'student',
    path: '/student/tutor',
    target: 'chat',
    overlaySide: 'top',
  },
  {
    id: 'studentRecommendations',
    section: 'student',
    persona: 'student',
    path: '/student/assignments',
    target: 'homework-recommendations',
  },
  {
    id: 'studentMap',
    section: 'student',
    persona: 'student',
    path: '/student/assignments',
    target: 'homework-map',
  },
  {
    id: 'studentCourse',
    section: 'student',
    persona: 'student',
    path: `/student/courses/${DEMO_IDS.course}`,
    target: 'course-modules',
  },
  {
    id: 'studentAssignment',
    section: 'student',
    persona: 'student',
    path: `/student/assignments/${DEMO_IDS.assignments.homework}`,
    target: 'assignment-answer',
  },
  {
    id: 'studentProfile',
    section: 'student',
    persona: 'student',
    path: '/student/profile',
    target: 'homework-pie',
  },
  {
    id: 'studentTrajectory',
    section: 'student',
    persona: 'student',
    path: '/student/profile',
    target: 'student-trajectory',
  },
  {
    id: 'studentSettings',
    section: 'student',
    persona: 'student',
    path: '/student/settings',
    target: 'settings',
  },

  // Родитель
  {
    id: 'parentChildren',
    section: 'parent',
    persona: 'parent',
    path: '/parent',
    target: 'parent-children',
  },
  {
    id: 'parentSchedule',
    section: 'parent',
    persona: 'parent',
    path: '/parent',
    target: 'day-schedule',
  },
  {
    id: 'parentHomework',
    section: 'parent',
    persona: 'parent',
    path: '/parent',
    target: 'parent-homework',
  },
  {
    id: 'parentWallet',
    section: 'parent',
    persona: 'parent',
    path: '/parent',
    target: 'wallet-chip',
  },
  {
    id: 'parentClubs',
    section: 'parent',
    persona: 'parent',
    path: '/parent/courses',
    target: 'parent-clubs',
  },
  {
    id: 'parentPayments',
    section: 'parent',
    persona: 'parent',
    path: '/parent/payments',
    target: 'parent-payments',
  },
  {
    id: 'parentAnalytics',
    section: 'parent',
    persona: 'parent',
    path: `/parent/analytics/${alexey}`,
    target: 'club-homework',
  },
  {
    id: 'parentTutor',
    section: 'parent',
    persona: 'parent',
    path: '/parent/tutor',
    target: 'chat',
    overlaySide: 'top',
  },
  {
    id: 'parentLink',
    section: 'parent',
    persona: 'parent',
    path: '/parent/children',
    target: 'link-child',
  },
  {
    id: 'parentCatalog',
    section: 'parent',
    persona: 'parent',
    path: '/parent/profile',
    target: 'club-catalog',
  },

  // Преподаватель
  {
    id: 'teacherHome',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher',
    target: 'day-schedule',
  },
  {
    id: 'teacherAssignments',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/assignments',
    target: 'teacher-assignments',
  },
  {
    id: 'teacherActions',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/assignments',
    target: 'teacher-assignment-actions',
  },
  {
    id: 'teacherAssign',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/assignments/new',
    target: 'assign-steps',
  },
  {
    id: 'teacherAttendance',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/attendance',
    target: 'attendance-lessons',
  },
  {
    id: 'teacherPerformance',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/performance',
    target: 'teacher-performance',
  },
  {
    id: 'teacherStudent',
    section: 'teacher',
    persona: 'teacher',
    path: `/teacher/students/${alexey}`,
    target: 'homework-pie',
  },
  {
    id: 'teacherWallet',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/wallet',
    target: 'teacher-wallet',
  },
  {
    id: 'teacherGroups',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/groups',
    target: 'teacher-groups',
  },
  {
    id: 'teacherCourses',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/courses',
    target: 'teacher-courses',
  },
  {
    id: 'teacherDemand',
    section: 'teacher',
    persona: 'teacher',
    path: '/teacher/clubs/demand',
    target: 'club-demand',
  },

  { id: 'finish', section: 'intro' },
];

/** Первый шаг раздела — для перехода к роли с приветственного шага. */
export function firstStepOf(section: DemoSection): number {
  return Math.max(
    0,
    DEMO_STEPS.findIndex((step) => step.section === section),
  );
}
