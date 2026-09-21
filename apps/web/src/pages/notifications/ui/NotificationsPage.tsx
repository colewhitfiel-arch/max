import { AppLayout, Card, EmptyState, PageHeader, Screen, SegmentedControl } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { NotificationRow, useMarkRead, useNotifications } from '@/entities/notification';
import { MarkReadButton } from '@/features/mark-notification-read';
import { AsyncState } from '@/shared/ui';

/** `/notifications` — общий для всех ролей список с отметкой прочтения. */
export function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotifications({ unreadOnly });
  const markRead = useMarkRead();

  const open = (id: string, route?: string) => {
    markRead.mutate([id]);
    if (route) navigate(route);
  };

  return (
    <AppLayout
      header={
        <PageHeader
          title={t('title')}
          subtitle={query.data ? t('unread', { count: query.data.unreadCount }) : undefined}
          onBack={() => navigate(-1)}
          actions={<MarkReadButton disabled={!query.data || query.data.unreadCount === 0} />}
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
            isEmpty={(page) => page.items.length === 0}
            empty={<EmptyState title={t('empty')} />}
          >
            {(page) => (
              <Card padding="none">
                {page.items.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    right={
                      !notification.readAt ? <MarkReadButton ids={[notification.id]} /> : undefined
                    }
                    onClick={() => open(notification.id, notification.payload?.route)}
                  />
                ))}
              </Card>
            )}
          </AsyncState>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
