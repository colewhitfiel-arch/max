import type { AttendanceStatus, LessonDto } from '@edu/contracts';
import type { Tone } from '@edu/ui';
import { isSameDay } from '@/shared/lib/dates';

/** Цвет отметки: пришёл — успех, опоздал — предупреждение, не был — опасность, по причине — нейтрально. */
export function attendanceTone(status: AttendanceStatus): Tone {
  switch (status) {
    case 'PRESENT':
      return 'success';
    case 'LATE':
      return 'warning';
    case 'ABSENT':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Занятие ещё ждёт отметки: началось, не отменено и не переведено в DONE. */
const needsMark = (lesson: LessonDto, now: Date) =>
  lesson.status === 'PLANNED' && new Date(lesson.startsAt).getTime() <= now.getTime();

/**
 * Разложить занятия для экрана отметки посещаемости по тому, насколько они сейчас важны:
 * сначала сегодняшние (обычно отмечают их), потом прошедшие без отметки — долг, который
 * видно сразу, и только затем ближайшие будущие. Отменённые не показываем: по ним отметки нет.
 */
export function lessonsToMark(
  lessons: LessonDto[],
  now = new Date(),
): { today: LessonDto[]; unmarked: LessonDto[]; upcoming: LessonDto[] } {
  const actual = lessons.filter((lesson) => lesson.status !== 'CANCELLED');
  const today = actual
    .filter((lesson) => isSameDay(lesson.startsAt, now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const todayIds = new Set(today.map((lesson) => lesson.id));
  const unmarked = actual
    .filter((lesson) => !todayIds.has(lesson.id) && needsMark(lesson, now))
    // Сначала самые свежие: чем дольше занятие не отмечено, тем меньше шансов вспомнить, кто был.
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const upcoming = actual
    .filter(
      (lesson) => !todayIds.has(lesson.id) && new Date(lesson.startsAt).getTime() > now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { today, unmarked, upcoming };
}

/** Занятия дня без повторов (списки «сегодня», «ближайшие» и календарь пересекаются), по времени. */
export function lessonsOfDay(lessons: LessonDto[], date: Date): LessonDto[] {
  const seen = new Set<string>();
  return lessons
    .filter((lesson) => {
      if (seen.has(lesson.id) || !isSameDay(lesson.startsAt, date)) return false;
      seen.add(lesson.id);
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
