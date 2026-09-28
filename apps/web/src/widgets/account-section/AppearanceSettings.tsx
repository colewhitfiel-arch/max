import { LOCALES, THEMES, type Locale, type Theme } from '@edu/contracts';
import {
  Card,
  CheckIcon,
  GlobeIcon,
  IconTile,
  ListRow,
  MoonIcon,
  SegmentedControl,
  Sheet,
  Text,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateSettings } from '@/entities/session';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { setLanguage } from '@/shared/i18n';
import { useUiStore } from '@/shared/store/ui-store';
import { SettingsGroup } from './SettingsGroup';

export interface AppearanceSettingsProps {
  /** Строка «Язык» (по умолчанию есть). Ученику, родителю и преподавателю не показывается — только тема. */
  showLanguage?: boolean;
}

/**
 * «Внешний вид»: тема (`SegmentedControl` внутри строки) и язык (строка → bottom sheet со списком).
 * Сохраняет через `PATCH /me/settings`; тема и язык применяются сразу и откатываются при ошибке.
 */
export function AppearanceSettings({ showLanguage = true }: AppearanceSettingsProps = {}) {
  const { t } = useTranslation('common');
  const { me } = useAuth();
  const toast = useToast();
  const updateSettings = useUpdateSettings();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [languageOpen, setLanguageOpen] = useState(false);

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
    setLanguageOpen(false);
    const prev = me.settings.locale;
    if (locale === prev) return;
    void setLanguage(locale);
    updateSettings.mutate(
      { locale },
      {
        onError: (error) => {
          void setLanguage(prev);
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
        {showLanguage && (
          <ListRow
            left={
              <IconTile tone="success">
                <GlobeIcon />
              </IconTile>
            }
            title={t('settings.language')}
            right={t(`locale.${me.settings.locale}`)}
            chevron
            onClick={() => setLanguageOpen(true)}
          />
        )}
      </Card>

      <Sheet
        open={showLanguage && languageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t('settings.languageSheet')}
        closeLabel={t('actions.close')}
      >
        <Card padding="none">
          {LOCALES.map((value) => {
            const active = value === me.settings.locale;
            return (
              <ListRow
                key={value}
                title={t(`locale.${value}`)}
                right={
                  active ? (
                    <Text as="span" tone="primary">
                      <CheckIcon />
                    </Text>
                  ) : undefined
                }
                chevron={false}
                onClick={() => onLocale(value)}
                aria-current={active ? 'true' : undefined}
              />
            );
          })}
        </Card>
      </Sheet>
    </SettingsGroup>
  );
}
