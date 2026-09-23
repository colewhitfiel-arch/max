/**
 * «Общая успеваемость» преподавателя — фейковый сервер повторяет счётчики analytics
 * (docs/04 §4.6) по каждой активной группе за период: посещения на уже начавшихся занятиях и
 * задания со сроком в периоде.
 *
 * Настоящие занятия демо-мира (`db.lessons`, кроме отменённых) считаются строго по §4.6: только
 * отметки журнала (`db.attendance`, в том числе ушедших из группы учеников), неотмеченные — ни в
 * один счётчик. **Намеренное отступление от §4.6 ради демо:** у фикстур всего несколько занятий,
 * поэтому мок добавляет синтетические прошлые занятия по правилам расписания группы (как «богатый
 * мир» родителя) — в недели, где у правила нет настоящего занятия, и в дни без разовых занятий.
 * На них PRESENT/ABSENT засеяны хешем (ученик, занятие) — одинаково от запуска к запуску. Этих
 * занятий нет ни в календаре, ни в журнале группы, ни в неделе ученика.
 */
import type {
  AttendanceStatus,
  TeacherGroupPerformance,
  TeacherPerformanceDto,
  TeacherPerformancePeriod,
} from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { addDays, startOfDay, toDateOnly } from '@/shared/lib/dates';
import { groupBrief, groupsOfTeacher } from './demo';
import { homeworkOf } from './homework';
import { roll } from './seed';
import { db } from './state';

/** Сколько процентов занятий по расписанию ученик пропускает (Даша в демо болеет чаще). */
const MISS_PERCENT: Partial<Record<string, number>> = { [DEMO_IDS.students.dasha]: 25 };
const MISS_PERCENT_DEFAULT = 10;
/** Учебный курс начинается 1 сентября (месяц 8 в Date). */
const COURSE_START_MONTH = 8;

/**
 * Начало периода: day — с начала сегодняшнего дня, week — 7 дней, month — 30 дней (включая
 * сегодня), course — с 1 сентября текущего учебного года. Конец — «сейчас».
 */
export function performanceFrom(period: TeacherPerformancePeriod, now = new Date()): Date {
  switch (period) {
    case 'day':
      return startOfDay(now);
    case 'week':
      return startOfDay(addDays(now, -6));
    case 'month':
      return startOfDay(addDays(now, -29));
    case 'course': {
      const year = now.getMonth() >= COURSE_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
      return new Date(year, COURSE_START_MONTH, 1);
    }
  }
}

interface Occurrence {
  /** Ключ для хеша: id занятия или `ruleId:YYYY-MM-DD`. */
  key: string;
  startsAt: Date;
  /** Настоящее занятие (считаются только его отметки) или null — синтетическое по правилу. */
  lessonId: string | null;
}

/** Понедельник календарной недели (пн–вс) дня — ключ «неделя правила уже в журнале». */
function weekOf(date: Date | string): string {
  const day = startOfDay(date);
  return toDateOnly(addDays(day, -((day.getDay() + 6) % 7)));
}

/** Уже начавшиеся занятия группы в [from, now]: настоящие и синтетические по правилам. */
function occurrences(groupId: string, from: Date, now: Date): Occurrence[] {
  const inWindow = (at: Date) => at >= from && at <= now;
  const fromDay = toDateOnly(from);
  const today = toDateOnly(now);
  const groupLessons = db.lessons.filter((l) => l.groupId === groupId);
  const lessons = groupLessons.filter((l) => {
    const day = toDateOnly(l.startsAt);
    return day >= fromDay && day <= today;
  });
  // День с разовым занятием (без правила; даже отменённым или ещё не начавшимся) правилами не
  // дополняем. Занятие по правилу бывает и не в свой день недели (перенос), поэтому правило не
  // дополняем во всей его календарной неделе — иначе одно занятие посчитается дважды.
  const oneOffDays = new Set(
    lessons.filter((l) => l.ruleId === null).map((l) => toDateOnly(l.startsAt)),
  );
  const ruleWeeks = new Set(
    groupLessons.filter((l) => l.ruleId !== null).map((l) => `${l.ruleId}:${weekOf(l.startsAt)}`),
  );
  const result: Occurrence[] = lessons
    .filter((l) => l.status !== 'CANCELLED' && inWindow(new Date(l.startsAt)))
    .map((l) => ({ key: l.id, startsAt: new Date(l.startsAt), lessonId: l.id }));
  const rules = db.scheduleRules.filter((r) => r.groupId === groupId);
  for (let day = startOfDay(from); day <= now; day = addDays(day, 1)) {
    const date = toDateOnly(day);
    if (oneOffDays.has(date)) continue;
    for (const rule of rules) {
      if (rule.weekday !== day.getDay() || date < rule.validFrom) continue;
      if (rule.validTo && date > rule.validTo) continue;
      if (ruleWeeks.has(`${rule.id}:${weekOf(day)}`)) continue;
      const [h, m] = rule.startTime.split(':').map(Number) as [number, number];
      const startsAt = new Date(day);
      startsAt.setHours(h, m, 0, 0);
      if (inWindow(startsAt)) result.push({ key: `${rule.id}:${date}`, startsAt, lessonId: null });
    }
  }
  return result;
}

/** Демо-отметка синтетического занятия: PRESENT/ABSENT по хешу (ученик, занятие). */
function syntheticStatus(studentId: string, occurrence: Occurrence): AttendanceStatus {
  const miss = MISS_PERCENT[studentId] ?? MISS_PERCENT_DEFAULT;
  return roll(`${studentId}:${occurrence.key}`, 'visit', 100) < miss ? 'ABSENT' : 'PRESENT';
}

/**
 * Счётчики группы: attended/missed — отметки PRESENT, LATE / ABSENT, EXCUSED (на настоящих
 * занятиях — все отметки журнала, неотмеченные не считаются; на синтетических — учеников,
 * зачисленных к началу занятия); homeworkDone — сданные задания со сроком в днях периода
 * (включая сегодняшние, срок которых вечером), homeworkCorrect — из них DONE (порог
 * преподавателя = порог родителя).
 */
function groupPerformance(groupId: string, from: Date, now: Date): TeacherGroupPerformance {
  const enrollments = db.enrollments.filter((e) => e.groupId === groupId && e.status === 'ACTIVE');
  let attended = 0;
  let missed = 0;
  const count = (status: AttendanceStatus) => {
    if (status === 'PRESENT' || status === 'LATE') attended += 1;
    else missed += 1;
  };
  for (const occurrence of occurrences(groupId, from, now)) {
    if (occurrence.lessonId) {
      for (const mark of db.attendance.filter((a) => a.lessonId === occurrence.lessonId)) {
        count(mark.status);
      }
      continue;
    }
    for (const enrollment of enrollments) {
      if (new Date(enrollment.enrolledAt) > occurrence.startsAt) continue;
      count(syntheticStatus(enrollment.studentId, occurrence));
    }
  }
  const dueFrom = from.getTime();
  const dueTo = addDays(startOfDay(now), 1).getTime();
  let homeworkDone = 0;
  let homeworkCorrect = 0;
  for (const enrollment of enrollments) {
    for (const entry of homeworkOf(enrollment.studentId, groupId, now, 'teacher')) {
      const due = entry.dueAt ? new Date(entry.dueAt).getTime() : Number.NaN;
      if (!(due >= dueFrom && due < dueTo) || !entry.submittedAt) continue;
      homeworkDone += 1;
      if (entry.status === 'DONE') homeworkCorrect += 1;
    }
  }
  return {
    group: groupBrief(groupId),
    studentsCount: enrollments.length,
    attended,
    missed,
    homeworkDone,
    homeworkCorrect,
  };
}

/** «Общая успеваемость» за период по всем активным группам преподавателя (без занятий — нули). */
export function teacherPerformance(
  teacherId: string,
  period: TeacherPerformancePeriod,
  now = new Date(),
): TeacherPerformanceDto {
  const from = performanceFrom(period, now);
  return {
    period,
    from: from.toISOString(),
    to: now.toISOString(),
    groups: groupsOfTeacher(teacherId)
      .filter((group) => group.isActive)
      .map((group) => groupPerformance(group.id, from, now)),
  };
}
