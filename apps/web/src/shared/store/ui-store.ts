/**
 * UI-состояние (zustand): тема и выбранный ребёнок родителя. Персист — через MaxBridge.storage.
 * Серверные данные здесь не живут (они в TanStack Query).
 */
import type { Theme } from '@edu/contracts';
import { applyTheme } from '@edu/ui';
import { create } from 'zustand';
import type { MaxBridge, MaxStorage, MaxTheme } from '../max/types';

export const UI_STORAGE_KEYS = {
  theme: 'ui.theme',
  selectedChildId: 'ui.selectedChildId',
} as const;

export interface UiState {
  /** Настройка пользователя (SYSTEM — тема MAX/ОС). */
  theme: Theme;
  /** Тема мессенджера, актуальная при SYSTEM. */
  maxTheme: MaxTheme;
  selectedChildId: string | null;
  hydrated: boolean;
  setTheme(theme: Theme): void;
  setMaxTheme(theme: MaxTheme): void;
  setSelectedChildId(id: string | null): void;
}

let storage: MaxStorage | null = null;

const THEME_VALUES: readonly Theme[] = ['SYSTEM', 'LIGHT', 'DARK'];

function persist(key: string, value: string | null): void {
  if (!storage) return;
  const op = value === null ? storage.remove(key) : storage.set(key, value);
  op.catch((cause) => console.warn('[ui-store] не удалось сохранить', key, cause));
}

/** Фактическая тема для `applyTheme`: SYSTEM → тема MAX. */
export function resolveUiTheme(theme: Theme, maxTheme: MaxTheme): 'light' | 'dark' {
  if (theme === 'LIGHT') return 'light';
  if (theme === 'DARK') return 'dark';
  return maxTheme;
}

export const useUiStore = create<UiState>()((set, get) => ({
  theme: 'SYSTEM',
  maxTheme: 'light',
  selectedChildId: null,
  hydrated: false,

  setTheme(theme) {
    set({ theme });
    persist(UI_STORAGE_KEYS.theme, theme);
    applyTheme(resolveUiTheme(theme, get().maxTheme));
  },

  setMaxTheme(maxTheme) {
    set({ maxTheme });
    applyTheme(resolveUiTheme(get().theme, maxTheme));
  },

  setSelectedChildId(selectedChildId) {
    set({ selectedChildId });
    persist(UI_STORAGE_KEYS.selectedChildId, selectedChildId);
  },
}));

/** Загрузить сохранённые значения и подписаться на тему MAX. Возвращает отписку. */
export async function hydrateUiStore(bridge: MaxBridge): Promise<() => void> {
  storage = bridge.storage;
  let theme: Theme = 'SYSTEM';
  let selectedChildId: string | null = null;
  try {
    const storedTheme = await bridge.storage.get(UI_STORAGE_KEYS.theme);
    if (storedTheme && THEME_VALUES.includes(storedTheme as Theme)) theme = storedTheme as Theme;
    selectedChildId = await bridge.storage.get(UI_STORAGE_KEYS.selectedChildId);
  } catch {
    /* без персиста */
  }
  let maxTheme: MaxTheme = 'light';
  try {
    maxTheme = bridge.getTheme();
  } catch {
    /* SDK недоступен */
  }
  useUiStore.setState({ theme, selectedChildId, maxTheme, hydrated: true });
  applyTheme(resolveUiTheme(theme, maxTheme));
  try {
    return bridge.on('theme', (next) => useUiStore.getState().setMaxTheme(next));
  } catch {
    return () => {};
  }
}

export const useSelectedChildId = () => useUiStore((s) => s.selectedChildId);
