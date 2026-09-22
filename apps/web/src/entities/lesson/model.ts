import type { LessonDto } from '@edu/contracts';
import { isSameDay } from '@/shared/lib/dates';

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
