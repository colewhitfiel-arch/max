import type { NotificationSettings as Settings, Role } from '@edu/contracts';
import {
  CalendarClockIcon,
  Card,
  ClipboardIcon,
  CreditCardIcon,
  EyeIcon,
  IconTile,
  ListRow,
  Skeleton,
  SparkIcon,
  Stack,
  StarIcon,
  Switch,
  Text,
  useToast,
  type IconProps,
  type Tone,
} from '@edu/ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/entities/notification';
import { describeApiError, isApiClientError } from '@/shared/api/errors';

type SettingKey = keyof Settings;

interface SettingMeta {
  key: SettingKey;
  icon: ComponentType<IconProps>;
  tone: Tone;
}

const ALL: SettingMeta[] = [
  { key: 'lessons', icon: CalendarClockIcon, tone: 'info' },
  { key: 'assignments', icon: ClipboardIcon, tone: 'warning' },
  { key: 'grades', icon: StarIcon, tone: 'success' },
  { key: 'attendance', icon: EyeIcon, tone: 'neutral' },
  { key: 'insights', icon: SparkIcon, tone: 'info' },
  { key: 'payments', icon: CreditCardIcon, tone: 'danger' },
];

/** Какие переключатели показывать роли: оплата — только родителю. */
const BY_ROLE: Record<Role, SettingKey[]> = {
  STUDENT: ['lessons', 'assignments', 'grades', 'attendance', 'insights'],
  PARENT: ['lessons', 'assignments', 'grades', 'attendance', 'insights', 'payments'],
  TEACHER: ['lessons', 'assignments', 'attendance', 'insights'],
  SCHOOL_ADMIN: ['lessons', 'assignments', 'attendance', 'payments'],
};

export interface NotificationSettingsProps {
  role: Role;
}

/**
 * «Уведомления»: переключатели по видам событий (`GET/PUT /me/notification-settings`),
 * оптимистично, с откатом и тостом при ошибке. Пока ручки нет на сервере (workstream L) —
 * короткая строка «появятся позже» вместо ошибки.
 */
export function NotificationSettings({ role }: NotificationSettingsProps) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const query = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const keys = BY_ROLE[role];
  const items = ALL.filter((item) => keys.includes(item.key));

  const onToggle = (key: SettingKey, value: boolean) => {
    if (!query.data) return;
    update.mutate(
      { ...query.data, [key]: value },
      {
        onError: (error) =>
          toast.show({
            tone: 'danger',
            title: t('account.settingsError'),
            description: describeApiError(error),
          }),
      },
    );
  };

  const unavailable =
    query.isError && isApiClientError(query.error) && query.error.isNotImplemented;

  return (
    <Stack gap={2}>
      <Text as="h2" variant="body" weight="bold">
        {t('settings.notifications')}
      </Text>
      <Card padding={query.isPending ? 'md' : 'none'}>
        {query.isPending ? (
          <Stack gap={3} aria-busy="true">
            <Skeleton height={36} />
            <Skeleton height={36} />
            <Skeleton height={36} />
          </Stack>
        ) : query.isError ? (
          <ListRow
            title={
              <Text as="span" variant="small" tone="muted">
                {unavailable ? t('settings.notificationsUnavailable') : t('states.error')}
              </Text>
            }
          />
        ) : (
          items.map(({ key, icon: Icon, tone }) => (
            <ListRow
              key={key}
              left={
                <IconTile tone={tone}>
                  <Icon />
                </IconTile>
              }
              title={t(`settings.notify.${key}.title`)}
              subtitle={t(`settings.notify.${key}.hint`)}
              right={
                <Switch
                  aria-label={t(`settings.notify.${key}.title`)}
                  checked={query.data[key]}
                  onChange={(event) => onToggle(key, event.target.checked)}
                />
              }
            />
          ))
        )}
      </Card>
    </Stack>
  );
}
