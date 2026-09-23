import { ROLES, type Role } from '@edu/contracts';
import { demoLoginUsers } from '@edu/contracts/fixtures';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Field,
  Inline,
  Input,
  ListRow,
  Stack,
  Text,
} from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';

export interface DevLoginFormProps {
  onLoggedIn?: () => void;
}

const SELECTABLE_ROLES: Role[] = ROLES.filter((role) => role !== 'SCHOOL_ADMIN');

/** Dev-вход: демо-пользователи из фикстур или произвольный maxUserId + роли → `POST /auth/dev`. */
export function DevLoginForm({ onLoggedIn }: DevLoginFormProps) {
  const { t } = useTranslation('auth');
  const { loginDev } = useAuth();
  const [maxUserId, setMaxUserId] = useState('');
  const [roles, setRoles] = useState<Role[]>(['STUDENT']);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = async (id: string, selected: Role[]) => {
    setPending(id);
    setError(null);
    try {
      await loginDev(id, selected);
      onLoggedIn?.();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!maxUserId.trim() || roles.length === 0) return;
    void login(maxUserId.trim(), roles);
  };

  const toggleRole = (role: Role, checked: boolean) =>
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text variant="title" as="h2">
          {t('login.demoUsers')}
        </Text>
        <Card padding="none">
          {demoLoginUsers.map((user) => (
            <ListRow
              key={user.maxUserId}
              title={user.name}
              subtitle={`${user.maxUserId} · ${user.roles.map((r) => t(`common:roles.${r}`)).join(', ')}`}
              onClick={() => void login(user.maxUserId, user.roles)}
              disabled={pending !== null}
              aria-busy={pending === user.maxUserId || undefined}
            />
          ))}
        </Card>
      </Stack>

      <Divider />

      <form onSubmit={onSubmit}>
        <Stack gap={3}>
          <Text variant="title" as="h2">
            {t('login.custom')}
          </Text>
          <Field label={t('login.maxUserId')} required>
            <Input
              value={maxUserId}
              onChange={(event) => setMaxUserId(event.target.value)}
              placeholder={t('login.maxUserIdPlaceholder')}
              autoComplete="off"
            />
          </Field>
          <Field
            label={t('login.roles')}
            error={roles.length === 0 ? t('login.rolesRequired') : undefined}
          >
            <Inline gap={3}>
              {SELECTABLE_ROLES.map((role) => (
                <Checkbox
                  key={role}
                  label={t(`common:roles.${role}`)}
                  checked={roles.includes(role)}
                  onChange={(event) => toggleRole(role, event.target.checked)}
                />
              ))}
            </Inline>
          </Field>
          {error && (
            <Text tone="danger" role="alert">
              {error}
            </Text>
          )}
          <Button
            type="submit"
            fullWidth
            loading={pending === maxUserId.trim() && pending !== ''}
            disabled={pending !== null || !maxUserId.trim() || roles.length === 0}
          >
            {t('login.submit')}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
