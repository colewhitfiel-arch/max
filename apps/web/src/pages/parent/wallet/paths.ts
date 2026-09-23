/** Путь пополнения кошелька родителя. */
export const WALLET_PATH = '/parent/wallet';

/**
 * Состояние навигации: кошелёк открыт из приложения (главная, настройки) — после пополнения
 * «назад» = шаг по истории. Без него (прямая ссылка, вход через /auth с replace) — на главную:
 * `location.key` после replace уже не `default`, а записи «до» в истории может не быть.
 */
export const FROM_APP_STATE = { fromApp: true } as const;

export function isFromApp(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromApp' in state;
}
