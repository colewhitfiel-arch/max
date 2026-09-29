import type { TrajectoryDto } from '@edu/contracts';
import {
  Button,
  Card,
  ChevronDownIcon,
  ChevronUpIcon,
  EmptyState,
  IconButton,
  IconTile,
  Inline,
  RefreshIcon,
  SparkIcon,
  Stack,
  Tag,
  Text,
  useToast,
} from '@edu/ui';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefreshTrajectory, useTrajectory } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dates';
import { AsyncState } from '@/shared/ui';

interface HeaderProps {
  pending: boolean;
  onRefresh: () => void;
  expanded: boolean;
  onToggle: () => void;
  /** id содержимого, которое раскрывает кнопка (`aria-controls`). */
  bodyId: string;
}

/** Заголовок секции: иконка ИИ, пересчёт (в раскрытом виде) и кнопка «показать / скрыть». */
function Header({ pending, onRefresh, expanded, onToggle, bodyId }: HeaderProps) {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  return (
    <Inline justify="between" align="center" wrap={false}>
      <Inline gap={2} wrap={false}>
        <IconTile tone="info" size="sm">
          <SparkIcon />
        </IconTile>
        <Text as="h2" variant="body" weight="bold">
          {t('profile.trajectory')}
        </Text>
      </Inline>
      <Inline gap={1} wrap={false}>
        {expanded && (
          <IconButton aria-label={tc('actions.refresh')} loading={pending} onClick={onRefresh}>
            <Text as="span" tone="muted">
              <RefreshIcon />
            </Text>
          </IconButton>
        )}
        <IconButton
          aria-label={expanded ? t('profile.trajectoryCollapse') : t('profile.trajectoryExpand')}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <Text as="span" tone="muted">
            {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Text>
        </IconButton>
      </Inline>
    </Inline>
  );
}

/** Содержимое траектории: резюме, сильные стороны / зоны роста тегами, шаги списком. */
function TrajectoryBody({ value, queued }: { value: TrajectoryDto; queued: boolean }) {
  const { t, i18n } = useTranslation('student');
  const { content } = value;
  return (
    <Card>
      <Stack gap={4}>
        <Text>{content.summary}</Text>

        {content.strengths.length > 0 && (
          <Stack gap={2}>
            <Text variant="caption" tone="muted" weight="medium">
              {t('profile.strengths')}
            </Text>
            <Inline gap={2}>
              {content.strengths.map((item) => (
                <Tag key={item} tone="success">
                  {item}
                </Tag>
              ))}
            </Inline>
          </Stack>
        )}

        {content.growthAreas.length > 0 && (
          <Stack gap={2}>
            <Text variant="caption" tone="muted" weight="medium">
              {t('profile.growth')}
            </Text>
            <Inline gap={2}>
              {content.growthAreas.map((item) => (
                <Tag key={item} tone="warning">
                  {item}
                </Tag>
              ))}
            </Inline>
          </Stack>
        )}

        {content.recommendations.length > 0 && (
          <Stack gap={2}>
            <Text variant="caption" tone="muted" weight="medium">
              {t('profile.recommendations')}
            </Text>
            <Stack gap={2}>
              {content.recommendations.map((item) => (
                <Stack key={item.title} gap={0}>
                  <Text variant="small" weight="medium">
                    {item.title}
                  </Text>
                  <Text variant="small" tone="muted">
                    {item.why}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}

        {content.nextSteps.length > 0 && (
          <Stack gap={2}>
            <Text variant="caption" tone="muted" weight="medium">
              {t('profile.nextSteps')}
            </Text>
            <Stack as="ol" gap={2}>
              {content.nextSteps.map((step, index) => (
                <Inline key={step} as="li" gap={3} align="start" wrap={false}>
                  <Tag tone="info">{index + 1}</Tag>
                  <Text variant="small">{step}</Text>
                </Inline>
              ))}
            </Stack>
          </Stack>
        )}

        <Text variant="caption" tone="muted">
          {queued
            ? t('profile.trajectoryQueued')
            : t('profile.trajectoryUpdated', {
                date: formatDateTime(value.generatedAt, i18n.language),
              })}
        </Text>
      </Stack>
    </Card>
  );
}

/** Сколько ждать пересчёта траектории после «Обновить» (подпись обещает «через минуту»). */
const QUEUE_TIMEOUT_MS = 60_000;

/**
 * Карточка «Моя траектория» (F5): `GET /student/trajectory` + пересчёт по кнопке. Свёрнута по
 * умолчанию (профиль короче): кнопка-шеврон в заголовке раскрывает и скрывает содержимое.
 */
export function TrajectoryCard() {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const refresh = useRefreshTrajectory();
  // Момент постановки в очередь: пока generatedAt старше — «пересчитываем» и опрос. Не дольше
  // QUEUE_TIMEOUT_MS: worker может ничего не перегенерировать (данные не изменились), и
  // подпись не должна висеть вечно.
  const [queuedAt, setQueuedAt] = useState<number | null>(null);
  const trajectory = useTrajectory({ queuedAt });
  const current = trajectory.data;
  const queued =
    queuedAt != null && (current == null || new Date(current.generatedAt).getTime() < queuedAt);

  useEffect(() => {
    if (queuedAt == null) return;
    const timer = setTimeout(() => setQueuedAt(null), QUEUE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [queuedAt]);

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: () => setQueuedAt(Date.now()),
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });

  return (
    <Stack gap={2} data-tour="student-trajectory">
      <Header
        pending={refresh.isPending}
        onRefresh={onRefresh}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        bodyId={bodyId}
      />
      <div id={bodyId} hidden={!expanded}>
        {expanded && (
          <AsyncState
            query={trajectory}
            isEmpty={(value) => value === null}
            empty={
              <Card>
                <EmptyState
                  icon={<SparkIcon size={40} />}
                  title={t('profile.trajectoryEmpty')}
                  description={queued ? t('profile.trajectoryQueued') : t('profile.trajectoryHint')}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={refresh.isPending}
                      onClick={onRefresh}
                    >
                      {tc('actions.refresh')}
                    </Button>
                  }
                />
              </Card>
            }
          >
            {(value) => value && <TrajectoryBody value={value} queued={queued} />}
          </AsyncState>
        )}
      </div>
    </Stack>
  );
}
