import { ROLE_LABELS } from '@edu/contracts';
import {
  Button,
  Card,
  IconTile,
  LifebuoyIcon,
  ListRow,
  PlusIcon,
  Sheet,
  Stack,
  UsersIcon,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { SwitchRole } from '@/features/switch-role';
import { useAuth } from '@/shared/auth/hooks';
import { ROLE_SETUP_PATH } from '@/shared/auth/role-routes';
import { useMaxBridge } from '@/shared/max';
import { SettingsGroup } from './SettingsGroup';

const SUPPORT_URL = 'https://t.me/edu_support';

/** «Аккаунт»: текущая роль (строка → sheet со сменой/добавлением роли) и поддержка. */
export function AccountSettings() {
  const { t } = useTranslation('common');
  const { me } = useAuth();
  const navigate = useNavigate();
  const bridge = useMaxBridge();
  const [roleOpen, setRoleOpen] = useState(false);

  if (!me) return null;

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
          right={me.activeRole ? ROLE_LABELS[me.activeRole] : '—'}
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
          onClick={() => bridge.openLink(SUPPORT_URL)}
        />
      </Card>

      <Sheet
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={t('settings.roleSheet')}
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
