import { BellIcon, IconButton, PageHeader } from '@edu/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** true — `navigate(-1)`; строка — путь назад. */
  back?: boolean | string;
  /** Колокольчик → /notifications. */
  bell?: boolean;
  actions?: ReactNode;
}

/** Шапка экрана поверх PageHeader: назад + уведомления, чтобы страницы не дублировали навигацию. */
export function ScreenHeader({ title, subtitle, back, bell = false, actions }: ScreenHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const onBack = back
    ? () => (typeof back === 'string' ? navigate(back) : navigate(-1))
    : undefined;
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      actions={
        actions || bell ? (
          <>
            {actions}
            {bell && (
              <IconButton
                aria-label={t('nav.notifications')}
                onClick={() => navigate('/notifications')}
              >
                <BellIcon />
              </IconButton>
            )}
          </>
        ) : undefined
      }
    />
  );
}
