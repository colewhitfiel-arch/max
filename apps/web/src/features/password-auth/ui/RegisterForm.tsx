import {
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  LOGIN_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@edu/contracts';
import { Button, Field, Input, Stack, Text } from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';

export interface RegisterFormProps {
  onRegistered?: () => void;
  /** «Уже есть аккаунт? Войти» — переключить экран на вход. */
  onLogin?: () => void;
}

type FieldName = 'firstName' | 'login' | 'password' | 'repeat';

/**
 * Регистрация вне MAX (`POST /auth/register`): имя, логин, пароль. Новый аккаунт — без ролей:
 * дальше выбор роли и онбординг этой роли (ученик — знакомство с тьютором, родитель — привязка
 * ребёнка, преподаватель — кружки и первая группа). Правила логина и пароля — из контракта.
 */
export function RegisterForm({ onRegistered, onLogin }: RegisterFormProps) {
  const { t } = useTranslation('auth');
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginTrimmed = login.trim();
  const errors: Partial<Record<FieldName, string>> = {
    firstName: firstName.trim() ? undefined : t('password.errors.firstName'),
    login:
      loginTrimmed.length < LOGIN_MIN_LENGTH || loginTrimmed.length > LOGIN_MAX_LENGTH
        ? t('password.errors.loginLength', { min: LOGIN_MIN_LENGTH, max: LOGIN_MAX_LENGTH })
        : LOGIN_PATTERN.test(loginTrimmed)
          ? undefined
          : t('password.errors.loginChars'),
    password:
      password.length < PASSWORD_MIN_LENGTH
        ? t('password.errors.passwordLength', { count: PASSWORD_MIN_LENGTH })
        : undefined,
    repeat: repeat === password ? undefined : t('password.errors.repeat'),
  };
  const valid = Object.values(errors).every((message) => message === undefined);
  const shown = (name: FieldName) => (touched[name] ? errors[name] : undefined);
  const touch = (name: FieldName) => () => setTouched((prev) => ({ ...prev, [name]: true }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ firstName: true, login: true, password: true, repeat: true });
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      await register({
        login: loginTrimmed,
        password,
        firstName: firstName.trim(),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      });
      onRegistered?.();
    } catch (cause) {
      setError(
        isApiClientError(cause) && cause.code === 'CONFLICT'
          ? t('password.errors.taken')
          : describeApiError(cause),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <Stack gap={3}>
        <Field label={t('password.firstName')} required error={shown('firstName')}>
          <Input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            onBlur={touch('firstName')}
            autoComplete="given-name"
            maxLength={60}
          />
        </Field>
        <Field label={t('password.lastName')}>
          <Input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            maxLength={60}
          />
        </Field>
        <Field
          label={t('password.login')}
          required
          hint={t('password.loginHint')}
          error={shown('login')}
        >
          <Input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            onBlur={touch('login')}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={LOGIN_MAX_LENGTH}
            placeholder={t('password.loginPlaceholder')}
          />
        </Field>
        <Field
          label={t('password.password')}
          required
          hint={t('password.passwordHint', { count: PASSWORD_MIN_LENGTH })}
          error={shown('password')}
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={touch('password')}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Field>
        <Field label={t('password.repeat')} required error={shown('repeat')}>
          <Input
            type="password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            onBlur={touch('repeat')}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Field>
        {error && (
          <Text tone="danger" role="alert">
            {error}
          </Text>
        )}
        <Button type="submit" fullWidth loading={pending}>
          {t('password.submitRegister')}
        </Button>
        <Text variant="caption" tone="muted" align="center">
          {t('password.nextStep')}
        </Text>
        {onLogin && (
          <Button variant="ghost" fullWidth onClick={onLogin}>
            {t('password.haveAccount')}
          </Button>
        )}
      </Stack>
    </form>
  );
}
