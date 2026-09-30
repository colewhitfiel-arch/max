import { Button, Field, Input, Stack, Text } from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';

export interface PasswordLoginFormProps {
  onLoggedIn?: () => void;
  /** «Нет аккаунта? Зарегистрироваться» — переключить экран входа на регистрацию. */
  onRegister?: () => void;
}

/** Вход по логину и паролю (`POST /auth/login`) — аккаунты, созданные регистрацией вне MAX. */
export function PasswordLoginForm({ onLoggedIn, onRegister }: PasswordLoginFormProps) {
  const { t } = useTranslation('auth');
  const { loginPassword } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = login.trim() !== '' && password !== '' && !pending;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await loginPassword(login.trim(), password);
      onLoggedIn?.();
    } catch (cause) {
      setError(
        isApiClientError(cause) && cause.code === 'UNAUTHORIZED'
          ? t('password.errors.invalid')
          : describeApiError(cause),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <Stack gap={3}>
        <Field label={t('password.login')} required>
          <Input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('password.loginPlaceholder')}
          />
        </Field>
        <Field label={t('password.password')} required>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && (
          <Text tone="danger" role="alert">
            {error}
          </Text>
        )}
        <Button type="submit" fullWidth loading={pending} disabled={!canSubmit}>
          {t('password.submitLogin')}
        </Button>
        {onRegister && (
          <Button variant="ghost" fullWidth onClick={onRegister}>
            {t('password.noAccount')}
          </Button>
        )}
      </Stack>
    </form>
  );
}
