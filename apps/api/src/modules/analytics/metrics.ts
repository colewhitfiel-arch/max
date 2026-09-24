/**
 * Базовые метрики успеваемости (docs/04 §4.x «Посещаемость», «Выполнение заданий», «Активность»,
 * «Прогресс по кружку»). Только чистые функции: счётчики приносит вызывающий, формулы — здесь,
 * чтобы цифры в ИИ-контексте и на экранах аналитики не расходились.
 */

/** Посещаемость `attended / countable` (`PRESENT | LATE` к зачётным занятиям); нет зачётных → null. */
export function attendanceRate(attended: number, countable: number): number | null {
  return countable > 0 ? attended / countable : null;
}

/** Выполнение заданий `doneOnTime / due`; нет заданий со сроком → null. */
export function completionRate(doneOnTime: number, due: number): number | null {
  return due > 0 ? doneOnTime / due : null;
}

/**
 * Активность 0–100: `min(100, 10*blocksCompleted + 15*submissions + 5*lessonsAttended +
 * 2*tutorMessages + 1*appOpens)`. Окно (неделя по docs/04) выбирает вызывающий.
 */
export function activityScore(input: {
  blocksCompleted: number;
  submissions: number;
  lessonsAttended: number;
  tutorMessages: number;
  appOpens?: number;
}): number {
  return Math.min(
    100,
    10 * input.blocksCompleted +
      15 * input.submissions +
      5 * input.lessonsAttended +
      2 * input.tutorMessages +
      (input.appOpens ?? 0),
  );
}

/** Прогресс по кружку: среднее `CourseProgress.percent` (округлённое); нет курсов → null. */
export function clubProgress(percents: number[]): number | null {
  if (percents.length === 0) return null;
  return Math.round(percents.reduce((sum, v) => sum + v, 0) / percents.length);
}
