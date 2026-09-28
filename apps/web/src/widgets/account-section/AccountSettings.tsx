import {
  Button,
  Card,
  IconTile,
  LifebuoyIcon,
  ListRow,
  PlusIcon,
  Sheet,
  Stack,
  useToast,
  UsersIcon,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SwitchRole } from '@/features/switch-role';
import { useAuth } from '@/shared/auth/hooks';
import { ROLE_SETUP_PATH } from '@/shared/auth/role-routes';
import { config } from '@/shared/config';
import { useMaxBridge } from '@/shared/max';
import { SettingsGroup } from './SettingsGroup';

export interface AccountSettingsProps {
  /**
   * Чат поддержки в MAX (`https://max.ru/<ник>`). По умолчанию — `config.supportUrl`
   * (`VITE_SUPPORT_URL`), общий для всех ролей. Пустая строка — чат не настроен: вместо
   * перехода подсказка-тост.
   */
  supportUrl?: string;
}

/** «Аккаунт»: текущая роль (строка → sheet со сменой/добавлением роли) и поддержка. */
export function AccountSettings({ supportUrl }: AccountSettingsProps = {}) {
  const { t } = useTranslation('common');
  const { me } = useAuth();
  const navigate = useNavigate();
  const bridge = useMaxBridge();
  const toast = useToast();
  const [roleOpen, setRoleOpen] = useState(false);

  if (!me) return null;

  // Ссылки max.ru мост открывает внутри MAX (openMaxLink) — чат, а не браузер.
  const openSupport = () => {
    const url = supportUrl ?? config.supportUrl;
    if (url) bridge.openLink(url);
    else toast.show({ tone: 'warning', title: t('settings.supportUnavailable') });
  };

  return (
    <SettingsGroup title={t('settings.account')}>
      <Card padding="none">
        <ListRow
          left={
            <IconTile tone="warning">
              <UsersIcon />
            </IconTile>
          }
          title={t('settings.role')}
          right={me.activeRole ? t(`roles.${me.activeRole}`) : '—'}
          chevron
          onClick={() => setRoleOpen(true)}
        />
        <ListRow
          left={
            <IconTile>
              <LifebuoyIcon />
            </IconTile>
          }
          title={t('settings.support')}
          subtitle={t('settings.supportHint')}
          onClick={openSupport}
        />
      </Card>

      <Sheet
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={t('settings.roleSheet')}
        closeLabel={t('actions.close')}
        footer={
          <Button
            variant="secondary"
            fullWidth
            leftIcon={<PlusIcon />}
            onClick={() => {
              setRoleOpen(false);
              navigate(ROLE_SETUP_PATH);
            }}
          >
            {t('actions.addRole')}
          </Button>
        }
      >
        <Stack gap={2}>
          <SwitchRole />
        </Stack>
      </Sheet>
    </SettingsGroup>
  );
}
