import { THEMES, type Theme } from '@edu/contracts';
import { Card, IconTile, ListRow, MoonIcon, SegmentedControl, useToast } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useUpdateSettings } from '@/entities/session';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { useUiStore } from '@/shared/store/ui-store';
import { SettingsGroup } from './SettingsGroup';

/**
 * «Внешний вид»: тема (`SegmentedControl` внутри строки). Выбора языка нет ни у одной роли
 * (docs/00 §1.4): интерфейс всегда на русском. Тема сохраняется через `PATCH /me/settings`,
 * применяется сразу и откатывается при ошибке.
 */
export function AppearanceSettings() {
  const { t } = useTranslation('common');
  const { me } = useAuth();
  const toast = useToast();
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

  return (
    <SettingsGroup title={t('settings.appearance')}>
      <Card padding="none">
        <ListRow
          left={
            <IconTile tone="info">
              <MoonIcon />
            </IconTile>
          }
          title={t('settings.theme')}
          below={
            <SegmentedControl
              fullWidth
              aria-label={t('settings.theme')}
              value={theme}
              onChange={(value) => onTheme(value as Theme)}
              disabled={updateSettings.isPending}
              options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
            />
          }
        />
      </Card>
    </SettingsGroup>
  );
}
