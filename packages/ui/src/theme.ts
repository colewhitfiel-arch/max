/** Режим темы. `system` — следовать настройке ОС/мессенджера. */
export type Theme = 'light' | 'dark' | 'system';

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

const ATTR = 'data-theme';

/**
 * Применяет тему: ставит `data-theme` на `<html>` (или на переданный элемент).
 * CSS в styles/tokens.css реагирует на атрибут.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute(ATTR, theme);
}

/** Читает текущий режим темы из атрибута; без атрибута — `system`. */
export function getTheme(root: HTMLElement = document.documentElement): Theme {
  const value = root.getAttribute(ATTR);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * Акцент палитры: `blue` — режим ученика (по умолчанию), `green` — режим родителя.
 * Меняет primary, focus, `--ui-color-accent-*` и свечение фона (styles/tokens.css).
 */
export type Accent = 'blue' | 'green';

export const ACCENTS: readonly Accent[] = ['blue', 'green'];

const ACCENT_ATTR = 'data-accent';

/**
 * Применяет акцент: ставит `data-accent` на `<html>` (или на переданный элемент).
 * `blue` — значение по умолчанию, для него атрибут снимается.
 */
export function applyAccent(accent: Accent, root: HTMLElement = document.documentElement): void {
  if (accent === 'blue') root.removeAttribute(ACCENT_ATTR);
  else root.setAttribute(ACCENT_ATTR, accent);
}

/** Читает текущий акцент из атрибута; без атрибута — `blue`. */
export function getAccent(root: HTMLElement = document.documentElement): Accent {
  return root.getAttribute(ACCENT_ATTR) === 'green' ? 'green' : 'blue';
}

/** Фактическая тема с учётом `system` и prefers-color-scheme. */
export function resolveTheme(theme: Theme = getTheme()): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
