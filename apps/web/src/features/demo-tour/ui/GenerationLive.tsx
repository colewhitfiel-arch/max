import type { GenerationStage } from '@edu/contracts';
import { Inline, ProgressBar, Spinner, Stack, Text } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isGenerationRunning, useGenerationJob } from '@/entities/generation';

export interface GenerationLiveProps {
  jobId: string;
  /** Черновик готов после того, как генерация шла на глазах, — тур идёт дальше сам. */
  onReady: () => void;
}

const DONE: readonly GenerationStage[] = ['READY', 'ACCEPTED'];

/**
 * Живой прогресс генерации в карточке тура: стадия и процент той же задачи, что на экране
 * (общий кэш запроса). Когда ИИ дописал черновик, тур переходит к нему без нажатия «Далее».
 */
export function GenerationLive({ jobId, onReady }: GenerationLiveProps) {
  const { t } = useTranslation('demo');
  const { t: tt } = useTranslation('teacher');
  const job = useGenerationJob(jobId).data;
  const sawRunning = useRef(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!job) return;
    if (isGenerationRunning(job.stage)) sawRunning.current = true;
    // Вернулись к шагу, когда черновик уже готов, — не перескакиваем вперёд сами.
    if (DONE.includes(job.stage) && sawRunning.current && !fired.current) {
      fired.current = true;
      onReady();
    }
  }, [job, onReady]);

  if (!job) return <Spinner size="sm" label={t('controls.loading')} />;
  const running = isGenerationRunning(job.stage);
  return (
    <Stack gap={1} aria-live="polite">
      <Inline gap={2} align="center" wrap={false}>
        {running && <Spinner size="sm" />}
        <Text variant="caption" weight="medium">
          {tt(`courseBuilder.stage.${job.stage}`)} · {job.progress}%
        </Text>
      </Inline>
      <ProgressBar
        value={job.progress}
        size="sm"
        tone={job.stage === 'FAILED' ? 'danger' : DONE.includes(job.stage) ? 'success' : 'info'}
        label={t('pipeline.progress')}
      />
      {job.stage === 'FAILED' && job.error && (
        <Text variant="caption" tone="danger" role="alert">
          {job.error}
        </Text>
      )}
    </Stack>
  );
}
