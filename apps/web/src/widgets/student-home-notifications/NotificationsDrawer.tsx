import { Card, Drawer, EmptyState, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { NotificationRow, useMarkRead, useNotifications } from '@/entities/notification';
import { MarkReadButton } from '@/features/mark-notification-read';
import { AsyncState, ListSkeleton } from '@/shared/ui';

export interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Список внутри панели: монтируется только при открытии, поэтому и запрос — только тогда. */
function NotificationsList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const query = useNotifications();
  const markRead = useMarkRead();

  const open = (id: string, route?: string) => {
    markRead.mutate([id]);
    if (route) {
      onClose();
      navigate(route);
    }
  };

  return (
    <AsyncState
      query={query}
      skeleton={<ListSkeleton rows={3} />}
      isEmpty={(page) => page.items.length === 0}
      empty={<EmptyState title={t('empty')} />}
    >
      {(page) => (
        <Stack gap={4}>
          {page.unreadCount > 0 && <MarkReadButton />}
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
        </Stack>
      )}
    </AsyncState>
  );
}

/**
 * Боковая панель уведомлений главной ученика (открывается колокольчиком): все уведомления,
 * новые с меткой; «Прочитано» по одному или все сразу; тап ведёт по ссылке уведомления.
 */
export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const { t } = useTranslation('notifications');
  return (
    <Drawer open={open} onClose={onClose} title={t('title')}>
      <NotificationsList onClose={onClose} />
    </Drawer>
  );
}
