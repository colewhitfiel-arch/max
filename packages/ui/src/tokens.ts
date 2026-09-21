/**
 * Токены, которые нужны в JS (CSS-переменные для них не работают или недоступны).
 * Значения z-index/длительностей продублированы в styles/tokens.css — менять синхронно.
 */

/** Брейкпоинты, px (min-width). */
export const breakpoints = { sm: 480, md: 768, lg: 1024 } as const;

/** Слои наложения; совпадают с --ui-z-*. */
export const zIndex = { sheet: 100, modal: 200, toast: 300 } as const;

/** Длительности анимаций, мс; совпадают с --ui-duration-*. */
export const durations = { fast: 120, normal: 200 } as const;

/** Максимальная ширина контента на широких экранах, px (--ui-content-max-width). */
export const contentMaxWidth = 640;

export const tokens = { breakpoints, zIndex, durations, contentMaxWidth } as const;

export type Breakpoint = keyof typeof breakpoints;
