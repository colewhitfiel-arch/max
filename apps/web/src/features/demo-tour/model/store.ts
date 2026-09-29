/**
 * Состояние демонстрационного режима: идёт ли тур и на каком он шаге. Хранится в sessionStorage
 * вкладки: перезагрузка страницы продолжает тур с того же шага (сессия демо-пользователя
 * восстанавливается обычным bootstrap), новая вкладка начинает без тура.
 */
import { create } from 'zustand';
import { DEMO_STEPS } from './steps';

const STORAGE_KEY = 'demo-tour';

export interface DemoTourState {
  active: boolean;
  /** Индекс текущего шага в `DEMO_STEPS`. */
  index: number;
  /** Начать тур с шага (по умолчанию — с первого). */
  start(index?: number): void;
  /** Перейти к шагу; за пределами сценария — закончить тур. */
  go(index: number): void;
  stop(): void;
}

interface Snapshot {
  active: boolean;
  index: number;
}

const clampIndex = (index: number) => Math.min(Math.max(0, index), DEMO_STEPS.length - 1);

function read(): Snapshot {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: false, index: 0 };
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    const index = typeof parsed.index === 'number' ? clampIndex(parsed.index) : 0;
    return { active: parsed.active === true, index };
  } catch {
    return { active: false, index: 0 };
  }
}

function write(snapshot: Snapshot): void {
  try {
    if (snapshot.active) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* хранилище недоступно — тур живёт до перезагрузки */
  }
}

export const useDemoTourStore = create<DemoTourState>()((set) => {
  const apply = (snapshot: Snapshot) => {
    write(snapshot);
    set(snapshot);
  };
  return {
    ...read(),
    start(index = 0) {
      apply({ active: true, index: clampIndex(index) });
    },
    go(index) {
      if (index < 0 || index >= DEMO_STEPS.length) apply({ active: false, index: 0 });
      else apply({ active: true, index });
    },
    stop() {
      apply({ active: false, index: 0 });
    },
  };
});

/** Запустить демонстрационный режим с первого шага. */
export function startDemoTour(index = 0): void {
  useDemoTourStore.getState().start(index);
}

/** Сброс для тестов. */
export function resetDemoTour(): void {
  useDemoTourStore.getState().stop();
}
