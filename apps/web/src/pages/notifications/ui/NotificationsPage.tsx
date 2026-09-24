import type { NotificationDto } from '@edu/contracts';
import {
  AppLayout,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  SegmentedControl,
  Stack,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { NotificationRow, useMarkRead, useNotificationsInfinite } from '@/entities/notification';
import { MarkReadButton } from '@/features/mark-notification-read';
import { describeApiError } from '@/shared/api/errors';
import { AsyncState } from '@/shared/ui';

/** `/notifications` — общий для всех ролей список с отметкой прочтения и подгрузкой «Ещё». */
export function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotificationsInfinite({ unreadOnly });
  const markRead = useMarkRead();
  const unreadCount = query.data?.pages[0]?.unreadCount;

  /** Тап по строке: непрочитанное — отметить; есть ссылка — перейти. */
  const open = (notification: NotificationDto) => {
    if (!notification.readAt) {
      markRead.mutate([notification.id], {
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      });
    }
    const route = notification.payload?.route;
    if (route) navigate(route);
  };

  return (
    <AppLayout
      header={
        <PageHeader
          title={t('title')}
          subtitle={unreadCount !== undefined ? t('unread', { count: unreadCount }) : undefined}
          onBack={() => navigate(-1)}
          actions={<MarkReadButton disabled={!unreadCount} />}
        />
      }
    >
      <AppLayout.Content>
        <Screen>
          <SegmentedControl
            fullWidth
            aria-label={t('title')}
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(value) => setUnreadOnly(value === 'unread')}
            options={[
              { value: 'all', label: t('all') },
              { value: 'unread', label: t('onlyUnread') },
            ]}
          />
          <AsyncState
            query={query}
            isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
            empty={<EmptyState title={t('empty')} />}
          >
            {(data) => (
              <Stack gap={3}>
                <Card padding="none">
                  {data.pages
                    .flatMap((page) => page.items)
                    .map((notification) => (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        right={
                          !notification.readAt ? (
                            <MarkReadButton ids={[notification.id]} compact={false} />
                          ) : undefined
                        }
                        onClick={
                          !notification.readAt || notification.payload?.route
                            ? () => open(notification)
                            : undefined
                        }
                      />
                    ))}
                </Card>
                {query.hasNextPage && (
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    {t('loadMore')}
                  </Button>
                )}
              </Stack>
            )}
          </AsyncState>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
