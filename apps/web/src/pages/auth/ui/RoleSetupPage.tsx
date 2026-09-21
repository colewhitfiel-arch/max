import { ROLE_LABELS, type Role } from '@edu/contracts';
import {
  AppLayout,
  Badge,
  Button,
  Card,
  Field,
  Input,
  ListRow,
  PageHeader,
  Screen,
  Stack,
  Text,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';

const OPTIONS: Role[] = ['STUDENT', 'PARENT', 'TEACHER'];

/** `/auth/role`: выбор первой роли (F1) или добавление новой (`POST /auth/roles`). */
export function RoleSetupPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { me, addRole } = useAuth();
  const [selected, setSelected] = useState<Role | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = me?.roles ?? [];
  const canContinue = selected !== null && !existing.includes(selected);

  const onContinue = async () => {
    if (!selected) return;
    setPending(true);
    setError(null);
    try {
      await addRole(selected, inviteCode.trim() || undefined);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <AppLayout
      header={
        <PageHeader
          title={t('roleSetup.title')}
          subtitle={t('roleSetup.subtitle')}
          onBack={existing.length > 0 ? () => navigate(-1) : undefined}
        />
      }
    >
      <AppLayout.Content>
        <Screen>
          {existing.length > 0 && (
            <Stack gap={2}>
              <Text variant="caption" tone="muted">
                {t('roleSetup.current')}
              </Text>
              <Card padding="none">
                {existing.map((role) => (
                  <ListRow
                    key={role}
                    title={ROLE_LABELS[role]}
                    right={
                      role === me?.activeRole ? (
                        <Badge tone="success">{t('switch.active')}</Badge>
                      ) : undefined
                    }
                  />
                ))}
              </Card>
            </Stack>
          )}

          <Stack gap={2}>
            <Text variant="caption" tone="muted">
              {t('roleSetup.add')}
            </Text>
            <Card padding="none">
              {OPTIONS.map((role) => (
                <ListRow
                  key={role}
                  title={t(`roleSetup.${role}`)}
                  right={selected === role ? <Badge tone="info">✓</Badge> : undefined}
                  disabled={existing.includes(role)}
                  onClick={() => setSelected(role)}
                  aria-pressed={selected === role}
                />
              ))}
            </Card>
          </Stack>

          {selected === 'TEACHER' && (
            <Field label={t('roleSetup.inviteCode')} hint={t('roleSetup.inviteCodeHint')}>
              <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            </Field>
          )}

          {error && (
            <Text tone="danger" role="alert">
              {error}
            </Text>
          )}

          <Button
            fullWidth
            disabled={!canContinue}
            loading={pending}
            onClick={() => void onContinue()}
          >
            {t('roleSetup.continue')}
          </Button>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
