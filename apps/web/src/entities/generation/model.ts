import type { GenerationStage } from '@edu/contracts';
import type { Tone } from '@edu/ui';
import { isGenerationRunning } from './api';

/**
 * Тон бейджа стадии генерации — единый для списка задач и экрана задачи: ошибка — danger,
 * готово/принято — success, идёт генерация — info, отменено — neutral.
 */
export function generationStageTone(stage: GenerationStage): Tone {
  if (stage === 'FAILED') return 'danger';
  if (stage === 'READY' || stage === 'ACCEPTED') return 'success';
  if (isGenerationRunning(stage)) return 'info';
  return 'neutral';
}
