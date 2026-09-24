/**
 * Состояние навигации (`navigate(path, { state })`) для кнопок «назад» / «✕»: как закрыть
 * экран — шагом по истории или заменой на родительский по иерархии. Общее для страниц разных
 * фич одной роли, чтобы они не импортировали друг друга.
 */

/**
 * Экран открыт из приложения (чип кошелька, настройки, ученики группы, группы): «назад» / «✕» —
 * шаг по истории. Без него (прямая ссылка, вход через /auth с replace) — замена экрана на
 * родительский: `location.key` после replace уже не `default`, а записи «до» в истории может
 * не быть.
 */
export const FROM_APP_STATE = { fromApp: true } as const;

export function isFromApp(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromApp' in state;
}

/** Экран открыт из сетки успеваемости (клетка задания): «Задания ✕» — шаг назад. */
export const FROM_ANALYTICS_STATE = { fromAnalytics: true } as const;

export function isFromAnalytics(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromAnalytics' in state;
}
