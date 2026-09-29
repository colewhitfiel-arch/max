import { BellIcon, IconButton, PageHeader, type PageHeaderVariant, Text } from '@edu/ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api, call } from '../api/client';
import { queryKeys } from '../api/query-keys';

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** true — `navigate(-1)`; строка — замена экрана на родительский путь (replace). */
  back?: boolean | string;
  /** Колокольчик со счётчиком непрочитанных → /notifications. */
  bell?: boolean;
  actions?: ReactNode;
  /** Действие слева (после «Назад»): например, история чатов тьютора. */
  leading?: ReactNode;
  /** По умолчанию `plain` — без плашки, заголовок по центру (как на главной из макета). */
  variant?: PageHeaderVariant;
  /** Прилипать к верху скролл-области (см. `PageHeader.sticky`). */
  sticky?: boolean;
}

/** Колокольчик как на главной: 30px, приглушённый; с непрочитанными — жёлтый со счётчиком. */
function NotificationsBell() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  // Тот же ключ, что у entities/notification.useNotifications({ unreadOnly: true }) — общий кэш;
  // shared не импортирует entities. В real-режиме до workstream L ручки нет — бейдж не показывается.
  const notifications = useQuery({
    queryKey: [...queryKeys.notifications, 'list', { unreadOnly: true }],
    queryFn: () => call(api.notifications.listNotifications({ query: { unreadOnly: 'true' } })),
  });
  const unreadCount = notifications.data?.unreadCount ?? 0;
  return (
    <IconButton
      aria-label={
        unreadCount ? t('nav.notificationsUnread', { count: unreadCount }) : t('nav.notifications')
      }
      onClick={() => navigate('/notifications')}
    >
      <Text as="span" tone="muted">
        <BellIcon size={30} count={unreadCount} />
      </Text>
    </IconButton>
  );
}

/** Шапка экрана поверх PageHeader: назад + уведомления, чтобы страницы не дублировали навигацию. */
export function ScreenHeader({
  title,
  subtitle,
  back,
  bell = false,
  actions,
  leading,
  variant = 'plain',
  sticky,
}: ScreenHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const onBack = back
    ? () => (typeof back === 'string' ? navigate(back, { replace: true }) : navigate(-1))
    : undefined;
  return (
    <PageHeader
      variant={variant}
      sticky={sticky}
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      backLabel={t('actions.back')}
      leading={leading}
      actions={
        actions || bell ? (
          <>
            {actions}
            {bell && <NotificationsBell />}
          </>
        ) : undefined
      }
    />
  );
}
