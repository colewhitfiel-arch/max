import type { NotificationDto } from '@edu/contracts';
import { Card, Drawer, EmptyState, Stack, useToast } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { NotificationRow, useMarkRead, useNotifications } from '@/entities/notification';
import { MarkReadButton } from '@/features/mark-notification-read';
import { describeApiError } from '@/shared/api/errors';
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
  const toast = useToast();
  const markRead = useMarkRead();

  /** Тап по строке: непрочитанное — отметить; есть ссылка — закрыть панель и перейти. */
  const open = (notification: NotificationDto) => {
    if (!notification.readAt) {
      markRead.mutate([notification.id], {
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      });
    }
    const route = notification.payload?.route;
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
                  !notification.readAt ? (
                    <MarkReadButton ids={[notification.id]} compact />
                  ) : undefined
                }
                // Прочитанное без ссылки — не кнопка: тап ничего бы не сделал.
                onClick={
                  !notification.readAt || notification.payload?.route
                    ? () => open(notification)
                    : undefined
                }
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
    <Drawer open={open} onClose={onClose} title={t('title')} closeLabel={t('common:actions.close')}>
      <NotificationsList onClose={onClose} />
    </Drawer>
  );
}
