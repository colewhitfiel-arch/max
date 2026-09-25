/**
 * Типизированный доступ к окружению (только `VITE_*`, см. корневой .env.example, секция Frontend).
 * Читается один раз на старте; дефолты — для локальной разработки.
 */
export type MaxMode = 'mock' | 'real';
export type AuthMode = 'dev' | 'max' | 'auto';

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export const config = {
  /** База API, уже с префиксом `/api/v1`. */
  apiUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, ''),
  /** mock — эмуляция MAX Bridge в браузере; real — SDK внутри MAX. */
  maxMode: oneOf<MaxMode>(import.meta.env.VITE_MAX_MODE, ['mock', 'real'], 'mock'),
  /**
   * dev — экран выбора пользователя/ролей; max — автовход по launch-параметрам;
   * auto — по контексту: внутри MAX вход по подписи, в обычном браузере — dev-экран.
   * `auto` нужен, чтобы один и тот же адрес открывался и в мессенджере, и в браузере.
   */
  authMode: oneOf<AuthMode>(import.meta.env.VITE_AUTH_MODE, ['dev', 'max', 'auto'], 'dev'),
  /** Dev-сборка Vite (playground, dev-кнопки). */
  isDev: import.meta.env.DEV,
} as const;

export type AppConfig = typeof config;
