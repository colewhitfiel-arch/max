/**
 * Геймификация главной ученика: серия (огонёк) и валюта (кристаллы). Формулы — docs/04 §4.6;
 * считает только analytics (чистые функции, данные приносит сервис модуля из событий
 * attendance/assignments). Даты — календарные дни в поясе школы (`YYYY-MM-DD`).
 */

/** Валюта за одно посещённое занятие (`PRESENT | LATE`). */
export const COINS_PER_ATTENDANCE = 50;
/** Валюта за одно правильно выполненное задание. */
export const COINS_PER_HOMEWORK = 20;
/** Задание выполнено правильно, если набрано строго больше 75% баллов. */
export const HOMEWORK_PASS_RATIO = 0.75;
/**
 * Окно серии: действие нужно хотя бы раз в 2 дня, т. е. между днями с действием
 * допускается один пустой день. Два пустых дня подряд — серия сгорает.
 */
export const STREAK_WINDOW_DAYS = 2;

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/**
 * Серия в днях: от первого дня текущей серии до последнего дня с действием включительно.
 * Действие — посещение занятия или сданное домашнее задание. Серия жива, пока с последнего
 * действия прошло не больше `STREAK_WINDOW_DAYS` дней (сегодня ещё можно успеть), иначе 0.
 *
 * @param activeDays дни с действием (`YYYY-MM-DD`, в любом порядке, с повторами)
 * @param today текущий день (`YYYY-MM-DD`)
 */
export function streakDays(activeDays: readonly string[], today: string): number {
  const todayN = dayNumber(today);
  const days = [...new Set(activeDays.map(dayNumber))]
    .filter((n) => n <= todayN)
    .sort((a, b) => b - a);
  const last = days[0];
  if (last === undefined || todayN - last > STREAK_WINDOW_DAYS) return 0;
  let start = last;
  for (const day of days.slice(1)) {
    if (start - day > STREAK_WINDOW_DAYS) break;
    start = day;
  }
  return last - start + 1;
}

/** Задание засчитано в валюту: оценено и набрано больше 75% максимума. */
export function isHomeworkPassed(score: number | null, maxScore: number): boolean {
  return score !== null && maxScore > 0 && score / maxScore > HOMEWORK_PASS_RATIO;
}

/**
 * Валюта ученика: 50 за каждое посещение + 20 за каждое правильно выполненное задание.
 * Задание считается один раз (лучшая попытка), даже если сдано несколько раз.
 *
 * @param attendedLessons число посещённых занятий (`PRESENT | LATE`)
 * @param homework лучшие результаты по заданиям
 */
export function coins(
  attendedLessons: number,
  homework: readonly { score: number | null; maxScore: number }[],
): number {
  const passed = homework.filter((item) => isHomeworkPassed(item.score, item.maxScore)).length;
  return attendedLessons * COINS_PER_ATTENDANCE + passed * COINS_PER_HOMEWORK;
}
