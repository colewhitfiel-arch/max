import type { HomeworkTask, HomeworkTaskStatus } from '@edu/contracts';
import type { Tone } from '@edu/ui';

/** Порог «правильно» у родителя: меньше — клетка красная (docs/04 §4.6). Ученик передаёт свой. */
export const DEFAULT_FAIL_PERCENT = 30;

/** Цвет клетки по статусу (docs/04 §4.6): зелёный, красный, жёлтый, серый. */
export const TONE_BY_TASK_STATUS: Record<HomeworkTaskStatus, Tone> = {
  DONE: 'success',
  FAILED: 'danger',
  SOON: 'warning',
  LATER: 'neutral',
};

/** Ключ подписи статуса: красный разделён на «мало баллов» и «просрочено без сдачи». */
export type TaskStatusLabelKey = 'DONE' | 'FAILED_SCORE' | 'FAILED_OVERDUE' | 'SOON' | 'LATER';

/**
 * FAILED — это либо проверено ниже порога «правильно», либо срок прошёл без сдачи; различаем по
 * наличию процента (у несданного его нет).
 */
export function taskStatusLabelKey(
  task: Pick<HomeworkTask, 'status' | 'scorePercent'>,
): TaskStatusLabelKey {
  if (task.status !== 'FAILED') return task.status;
  return task.scorePercent == null ? 'FAILED_OVERDUE' : 'FAILED_SCORE';
}
