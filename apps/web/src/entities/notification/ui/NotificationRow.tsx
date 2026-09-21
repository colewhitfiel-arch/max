import type { NotificationDto } from '@edu/contracts';
import { Badge, ListRow } from '@edu/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/shared/lib/dates';

export interface NotificationRowProps {
  notification: NotificationDto;
  right?: ReactNode;
  onClick?: () => void;
}

/** Уведомление в списке: тип, текст, время, метка «новое». */
export function NotificationRow({ notification, right, onClick }: NotificationRowProps) {
  const { t, i18n } = useTranslation('notifications');
  const unread = !notification.readAt;
  return (
    <ListRow
      title={notification.title}
      subtitle={[notification.body, formatDateTime(notification.createdAt, i18n.language)]
        .filter(Boolean)
        .join(' · ')}
      left={unread ? <Badge tone="info" dot aria-label={t('unread', { count: 1 })} /> : undefined}
      right={right ?? <Badge>{t(`type.${notification.type}`)}</Badge>}
      onClick={onClick}
    />
  );
}
