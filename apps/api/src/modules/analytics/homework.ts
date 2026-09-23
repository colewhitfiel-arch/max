/**
 * Статусы заданий в аналитике (docs/04 §4.6 «Статус задания»): клетки DONE / FAILED / SOON /
 * LATER, итоги по ним и порядковый номер задания в группе. Только чистые функции — как и
 * остальные формулы аналитики, живут в одном модуле, чтобы цифры у ученика, родителя и
 * преподавателя не расходились.
 */
import type { HomeworkCounts, HomeworkTask, HomeworkTaskStatus } from '@edu/contracts';
import type { StudentAssignmentFact } from '../assignments/assignments.service';
import { HOMEWORK_PASS_RATIO } from './gamification';

/** Дедлайн ближе этого — «скоро» (жёлтая клетка). */
export const SOON_MS = 72 * 60 * 60 * 1000;
/** Порог «правильно» у родителя и преподавателя: проверено меньше 30% — красная клетка. */
export const HOMEWORK_FAIL_RATIO = 0.3;

/**
 * Чей порог «правильно»: у ученика — как у кристаллов (строго больше 75%, docs/04 §4.6),
 * у родителя и преподавателя — 30%.
 */
export type HomeworkAudience = 'STUDENT' | 'ADULT';

const isSubmitted = (fact: StudentAssignmentFact) =>
  fact.submission?.status === 'SUBMITTED' || fact.submission?.status === 'GRADED';

/** Задание засчитано: оценка ещё не выставлена или балл выше порога аудитории. */
function isGoodEnough(fact: StudentAssignmentFact, audience: HomeworkAudience): boolean {
  const score = fact.submission?.score ?? null;
  if (score === null || fact.maxScore <= 0) return true;
  const ratio = score / fact.maxScore;
  return audience === 'STUDENT' ? ratio > HOMEWORK_PASS_RATIO : ratio >= HOMEWORK_FAIL_RATIO;
}

/** Статус клетки задания. `now` — «сейчас» (тесты передают фиксированное время). */
export function homeworkStatus(
  fact: StudentAssignmentFact,
  audience: HomeworkAudience,
  now = new Date(),
): HomeworkTaskStatus {
  if (isSubmitted(fact)) return isGoodEnough(fact, audience) ? 'DONE' : 'FAILED';
  const dueAt = fact.dueAt?.getTime();
  if (dueAt === undefined) return 'LATER';
  if (dueAt < now.getTime()) return 'FAILED';
  return dueAt - now.getTime() <= SOON_MS ? 'SOON' : 'LATER';
}

/** Порядок заданий внутри группы: по сроку (без срока — в конец), затем по публикации. */
export function byHomeworkOrder(a: StudentAssignmentFact, b: StudentAssignmentFact): number {
  const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA - dueB;
  return (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);
}

/** Задания одной группы в клетки: `number` с 1 в порядке `byHomeworkOrder`. */
export function homeworkTasks(
  facts: StudentAssignmentFact[],
  audience: HomeworkAudience,
  now = new Date(),
): HomeworkTask[] {
  return [...facts].sort(byHomeworkOrder).map((fact, index) => {
    const score = fact.submission?.score ?? null;
    return {
      assignmentId: fact.id,
      number: index + 1,
      title: fact.title,
      status: homeworkStatus(fact, audience, now),
      dueAt: fact.dueAt?.toISOString() ?? null,
      scorePercent:
        score === null || fact.maxScore <= 0 ? null : Math.round((100 * score) / fact.maxScore),
    };
  });
}

/** Итоги по клеткам: correct = DONE, wrong = FAILED, upcoming = SOON + LATER. */
export function homeworkCounts(tasks: readonly HomeworkTask[]): HomeworkCounts {
  return {
    correct: tasks.filter((task) => task.status === 'DONE').length,
    wrong: tasks.filter((task) => task.status === 'FAILED').length,
    upcoming: tasks.filter((task) => task.status === 'SOON' || task.status === 'LATER').length,
  };
}

/** Сумма итогов по кружкам — полоса «Успеваемость» целиком. */
export function sumHomeworkCounts(parts: readonly HomeworkCounts[]): HomeworkCounts {
  return parts.reduce<HomeworkCounts>(
    (sum, part) => ({
      correct: sum.correct + part.correct,
      wrong: sum.wrong + part.wrong,
      upcoming: sum.upcoming + part.upcoming,
    }),
    { correct: 0, wrong: 0, upcoming: 0 },
  );
}
