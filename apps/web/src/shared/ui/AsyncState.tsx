/**
 * Стандартные состояния запроса поверх компонентов @edu/ui (без собственных стилей):
 * loading → Skeleton, error → ErrorState («Раздел в разработке» без кнопки повтора для
 * NOT_FOUND/NOT_IMPLEMENTED), empty → EmptyState, ready → children(data).
 */
import { Card, EmptyState, ErrorState, Skeleton, SkeletonText, Stack } from '@edu/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { describeApiError, isApiClientError } from '../api/errors';

export interface AsyncStateProps<T> {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isPending' | 'isError' | 'refetch'>;
  /** Признак пустых данных; если true — показывается `empty`. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

export function AsyncState<T>({ query, isEmpty, empty, skeleton, children }: AsyncStateProps<T>) {
  const { t } = useTranslation('common');
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data)) {
    return <>{empty ?? <EmptyState title={t('states.empty')} />}</>;
  }
  return <>{children(data)}</>;
}

/** Ошибка запроса: для «в разработке» — без повтора. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation('common');
  const notImplemented = isApiClientError(error) && error.isNotImplemented;
  if (notImplemented) {
    return (
      <ErrorState
        title={t('states.inDevelopment')}
        description={t('states.inDevelopmentHint')}
        icon={<span aria-hidden="true">🛠</span>}
      />
    );
  }
  return (
    <ErrorState
      title={t('states.error')}
      description={describeApiError(error)}
      onRetry={onRetry}
      retryLabel={t('actions.retry')}
    />
  );
}

/** Скелет списка карточек. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap={3} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i}>
          <Stack gap={2}>
            <Skeleton height={16} width="55%" />
            <SkeletonText lines={2} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

/** Скелет дашборда: плитки + список. */
export function DashboardSkeleton() {
  return (
    <Stack gap={4} aria-busy="true">
      <Stack gap={2}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </Stack>
      <ListSkeleton rows={2} />
    </Stack>
  );
}
