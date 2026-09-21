/**
 * Сжатый снимок ученика для модели (docs/06 §6.3). Типы определены локально:
 * пакет не зависит от `@edu/contracts`, снимок собирает `modules/ai/context-builder`.
 *
 * PII-минимизация — ответственность сборщика: сюда попадает имя/ник, без фамилий и контактов.
 */

export interface StudentContextStudent {
  name: string;
  classLabel?: string;
  interests: string[];
  goals: string[];
  weeklyHours?: number;
  preferredFormats: string[];
  aiProfileSummary?: string;
}

export interface StudentContextClub {
  title: string;
  category: string;
  teacherName: string;
  scheduleText: string;
  /** 0..100 */
  progressPercent: number;
  /** 0..1 или null, если данных нет */
  attendanceRate: number | null;
}

export interface StudentContextLesson {
  club: string;
  /** ISO 8601 */
  startsAt: string;
  topic?: string;
}

export interface StudentContextAssignment {
  title: string;
  club: string;
  /** ISO 8601 */
  dueAt?: string;
  type: string;
  status: string;
}

export interface StudentContextResult {
  title: string;
  club: string;
  score: number;
  maxScore: number;
  isLate: boolean;
  /** ISO 8601 */
  at: string;
}

export interface StudentContextStats {
  /** 0..1 или null */
  attendanceRate: number | null;
  /** 0..1 или null */
  completionRate: number | null;
  activityScore: number;
  absences: number;
  lateCount: number;
}

export interface StudentContextCourseProgress {
  course: string;
  /** 0..100 */
  percent: number;
  nextBlockTitle?: string;
}

export interface StudentContextTrajectory {
  summary: string;
  nextSteps: string[];
}

export interface StudentContext {
  student: StudentContextStudent;
  clubs: StudentContextClub[];
  /** Ближайшие 7 дней. */
  upcomingLessons: StudentContextLesson[];
  /** ≤ 10 */
  openAssignments: StudentContextAssignment[];
  /** ≤ 10 */
  recentResults: StudentContextResult[];
  stats30d: StudentContextStats;
  courseProgress: StudentContextCourseProgress[];
  trajectory?: StudentContextTrajectory;
  /** ISO 8601 */
  now: string;
  /** IANA, например `Europe/Moscow`. */
  timezone: string;
}

export interface SerializeStudentContextOptions {
  /** Лимит длины текста. По умолчанию 6000 символов (≈ 2000–2500 токенов). */
  maxChars?: number;
  /** Максимум элементов в каждом списке до обрезки по лимиту. По умолчанию 10. */
  maxItems?: number;
}

export const DEFAULT_CONTEXT_MAX_CHARS = 6000;

/** Грубая оценка токенов для русского текста (≈ 3 символа на токен). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

interface ListSection {
  title: string;
  items: string[];
  /** Чем меньше, тем раньше секция урезается при превышении лимита. */
  trimPriority: number;
  shown: number;
}

/**
 * Сериализует снимок в компактный русский текст секциями.
 * При превышении `maxChars` списки урезаются по одному элементу (сначала наименее важные),
 * в конце добавляется «…и ещё N»; если и этого мало — текст обрезается жёстко.
 */
export function serializeStudentContext(
  ctx: StudentContext,
  options: SerializeStudentContextOptions = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_CONTEXT_MAX_CHARS;
  const maxItems = options.maxItems ?? 10;
  const formatDate = createDateFormatter(ctx.timezone);

  const head = renderStudent(ctx.student);
  head.push(`Сейчас: ${formatDate(ctx.now, { year: true })} (${ctx.timezone}).`);

  const lists: ListSection[] = [
    section(
      'Кружки',
      ctx.clubs.map(
        (club) =>
          `- ${clean(club.title)} (${clean(club.category)}); преподаватель: ${clean(club.teacherName)}; ` +
          `расписание: ${clean(club.scheduleText)}; прогресс: ${club.progressPercent}%; ` +
          `посещаемость: ${percent(club.attendanceRate)}`,
      ),
      4,
      maxItems,
    ),
    section(
      'Ближайшие занятия (7 дней)',
      ctx.upcomingLessons.map(
        (lesson) =>
          `- ${formatDate(lesson.startsAt)} — ${clean(lesson.club)}` +
          (lesson.topic ? `: ${clean(lesson.topic)}` : ''),
      ),
      3,
      maxItems,
    ),
    section(
      'Открытые задания',
      ctx.openAssignments.map(
        (a) =>
          `- «${clean(a.title)}» (${clean(a.club)}, ${clean(a.type)}, ${clean(a.status)})` +
          (a.dueAt ? `, срок: ${formatDate(a.dueAt)}` : ''),
      ),
      5,
      maxItems,
    ),
    section(
      'Последние результаты',
      ctx.recentResults.map(
        (r) =>
          `- «${clean(r.title)}» (${clean(r.club)}): ${r.score}/${r.maxScore}, ${formatDate(r.at)}` +
          (r.isLate ? ', с опозданием' : ''),
      ),
      2,
      maxItems,
    ),
    section(
      'Прогресс по курсам',
      ctx.courseProgress.map(
        (c) =>
          `- «${clean(c.course)}»: ${c.percent}%` +
          (c.nextBlockTitle ? `, следующий блок: «${clean(c.nextBlockTitle)}»` : ''),
      ),
      1,
      maxItems,
    ),
  ];

  const stats = ctx.stats30d;
  const tail: string[] = [
    `Статистика за 30 дней: посещаемость ${percent(stats.attendanceRate)}, ` +
      `выполнение заданий ${percent(stats.completionRate)}, индекс активности ${stats.activityScore}, ` +
      `пропусков ${stats.absences}, опозданий ${stats.lateCount}.`,
  ];
  if (ctx.trajectory) {
    tail.push(`Траектория: ${clean(ctx.trajectory.summary)}`);
    if (ctx.trajectory.nextSteps.length > 0) {
      tail.push('Следующие шаги:', ...ctx.trajectory.nextSteps.map((step) => `- ${clean(step)}`));
    }
  }

  const render = () =>
    [head.join('\n'), ...lists.map(renderList).filter(Boolean), tail.join('\n')].join('\n\n');

  let text = render();
  while (text.length > maxChars) {
    const candidate = lists
      .filter((s) => s.shown > 0)
      .sort((a, b) => a.trimPriority - b.trimPriority)[0];
    if (!candidate) break;
    candidate.shown -= 1;
    text = render();
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return text;
}

function section(
  title: string,
  items: string[],
  trimPriority: number,
  maxItems: number,
): ListSection {
  return { title, items, trimPriority, shown: Math.min(items.length, maxItems) };
}

function renderList(s: ListSection): string {
  if (s.items.length === 0) return '';
  const lines = [`${s.title} (${s.items.length}):`, ...s.items.slice(0, s.shown)];
  const hidden = s.items.length - s.shown;
  if (hidden > 0) lines.push(`…и ещё ${hidden}`);
  return lines.join('\n');
}

function renderStudent(student: StudentContextStudent): string[] {
  const lines: string[] = [];
  lines.push(
    `Ученик: ${clean(student.name)}${student.classLabel ? `, ${clean(student.classLabel)}` : ''}.`,
  );
  if (student.interests.length > 0) lines.push(`Интересы: ${joinList(student.interests)}.`);
  if (student.goals.length > 0) lines.push(`Цели: ${joinList(student.goals)}.`);
  if (student.weeklyHours !== undefined) lines.push(`Нагрузка: ${student.weeklyHours} ч/нед.`);
  if (student.preferredFormats.length > 0) {
    lines.push(`Предпочитаемые форматы: ${joinList(student.preferredFormats)}.`);
  }
  if (student.aiProfileSummary) lines.push(`Профиль: ${clean(student.aiProfileSummary)}`);
  return lines;
}

function joinList(items: string[]): string {
  return items.map(clean).filter(Boolean).join(', ');
}

/** Схлопывает переводы строк и лишние пробелы, чтобы не ломать построчный формат. */
function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function percent(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return 'нет данных';
  return `${Math.round(rate * 100)}%`;
}

type DateFormatter = (iso: string, opts?: { year?: boolean }) => string;

/** `дд.мм чч:мм` (или `дд.мм.гггг чч:мм`) в поясе ученика; при ошибке — исходная строка. */
function createDateFormatter(timezone: string): DateFormatter {
  const formatter = makeIntl(timezone) ?? makeIntl('UTC');
  return (iso, opts = {}) => {
    const date = new Date(iso);
    if (!formatter || Number.isNaN(date.getTime())) return iso;
    const parts = new Map<string, string>();
    for (const part of formatter.formatToParts(date)) parts.set(part.type, part.value);
    const day = parts.get('day') ?? '??';
    const month = parts.get('month') ?? '??';
    const year = parts.get('year') ?? '????';
    const hour = parts.get('hour') ?? '??';
    const minute = parts.get('minute') ?? '??';
    return opts.year
      ? `${day}.${month}.${year} ${hour}:${minute}`
      : `${day}.${month} ${hour}:${minute}`;
  };
}

function makeIntl(timezone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return undefined;
  }
}
