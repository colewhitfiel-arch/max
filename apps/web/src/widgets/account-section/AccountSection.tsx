import { LOCALES, ROLE_LABELS, THEMES, type Locale, type Theme } from '@edu/contracts';
import {
  Button,
  Card,
  Field,
  ListRow,
  SegmentedControl,
  Select,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useUpdateSettings } from '@/entities/session';
import { SwitchRole } from '@/features/switch-role';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { AUTH_PATH, ROLE_SETUP_PATH } from '@/shared/auth/role-routes';
import { setLanguage } from '@/shared/i18n';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';
import { useUiStore } from '@/shared/store/ui-store';
import { SectionTitle } from '@/shared/ui';

const SUPPORT_URL = 'https://t.me/edu_support';

/**
 * Общий блок «аккаунт» для настроек всех ролей: тема/язык (`PATCH /me/settings` + applyTheme),
 * смена/добавление роли, поддержка, выход.
 */
export function AccountSection() {
  const { t } = useTranslation('common');
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const bridge = useMaxBridge();
  const updateSettings = useUpdateSettings();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  if (!me) return null;

  const onTheme = (next: Theme) => {
    const prev = theme;
    setTheme(next);
    updateSettings.mutate(
      { theme: next },
      {
        onError: (error) => {
          setTheme(prev);
          toast.show({
            tone: 'danger',
            title: t('account.settingsError'),
            description: describeApiError(error),
          });
        },
      },
    );
  };

  const onLocale = (locale: Locale) => {
    void setLanguage(locale);
    updateSettings.mutate(
      { locale },
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

  const onLogout = async () => {
    await logout();
    navigate(AUTH_PATH, { replace: true });
  };

  return (
    <Stack gap={4}>
      <Card>
        <Stack gap={1}>
          <Text weight="medium">{fullName(me.user)}</Text>
          <Text variant="caption" tone="muted">
            {t('account.role')}: {me.activeRole ? ROLE_LABELS[me.activeRole] : '—'}
          </Text>
        </Stack>
      </Card>

      <Field label={t('theme.label')}>
        <SegmentedControl
          fullWidth
          aria-label={t('theme.label')}
          value={theme}
          onChange={(value) => onTheme(value as Theme)}
          disabled={updateSettings.isPending}
          options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
        />
      </Field>

      <Field label={t('locale.label')}>
        <Select
          value={me.settings.locale}
          onChange={(event) => onLocale(event.target.value as Locale)}
          options={LOCALES.map((value) => ({ value, label: t(`locale.${value}`) }))}
        />
      </Field>

      <Stack gap={2}>
        <SectionTitle
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate(ROLE_SETUP_PATH)}>
              {t('actions.addRole')}
            </Button>
          }
        >
          {t('actions.switchRole')}
        </SectionTitle>
        <SwitchRole />
      </Stack>

      <Card padding="none">
        <ListRow title={t('account.support')} onClick={() => bridge.openLink(SUPPORT_URL)} />
      </Card>

      <Button variant="danger" fullWidth onClick={() => void onLogout()}>
        {t('actions.logout')}
      </Button>
    </Stack>
  );
}
