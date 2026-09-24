import type { TeacherAssignmentCard } from '@edu/contracts';
import type { Tone } from '@edu/ui';

/**
 * Тон бейджа «N из M сдали»: сдали все — success, часть — info, никто (или в группе нет
 * учеников) — neutral. Проверка работ на тон не влияет: «0 из 2» больше не выглядит успехом.
 */
export function submissionTone({
  submittedCount,
  studentsCount,
}: Pick<TeacherAssignmentCard, 'submittedCount' | 'studentsCount'>): Tone {
  if (studentsCount === 0 || submittedCount === 0) return 'neutral';
  return submittedCount >= studentsCount ? 'success' : 'info';
}
