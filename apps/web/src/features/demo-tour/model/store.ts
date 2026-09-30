/**
 * Состояние демонстрационного режима: идёт ли тур, на каком он шаге и что уже создал в этом
 * прогоне (задача генерации и курс раздела «Конспект → курс»). Хранится в sessionStorage
 * вкладки: перезагрузка страницы продолжает тур с того же шага (сессия демо-пользователя
 * восстанавливается обычным bootstrap), новая вкладка начинает без тура.
 */
import { create } from 'zustand';
import type { DemoContext } from './pipeline';
import { DEMO_STEPS } from './steps';

const STORAGE_KEY = 'demo-tour';

export interface DemoTourState {
  active: boolean;
  /** Индекс текущего шага в `DEMO_STEPS`. */
  index: number;
  /** Что тур создал в этом прогоне; новый запуск тура начинает с пустого. */
  context: DemoContext;
  /** Начать тур с шага (по умолчанию — с первого). */
  start(index?: number): void;
  /** Перейти к шагу; за пределами сценария — закончить тур. */
  go(index: number): void;
  stop(): void;
  /** Дополнить контекст прогона результатом действия шага. */
  setContext(patch: DemoContext): void;
}

interface Snapshot {
  active: boolean;
  index: number;
  context: DemoContext;
}

const EMPTY: Snapshot = { active: false, index: 0, context: {} };

const clampIndex = (index: number) => Math.min(Math.max(0, index), DEMO_STEPS.length - 1);

/** Только строковые id из сохранённого контекста — остальное отбрасываем. */
function readContext(raw: unknown): DemoContext {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: DemoContext = {};
  for (const key of ['jobId', 'courseId', 'lessonId', 'quizId'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

function read(): Snapshot {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    const index = typeof parsed.index === 'number' ? clampIndex(parsed.index) : 0;
    return { active: parsed.active === true, index, context: readContext(parsed.context) };
  } catch {
    return EMPTY;
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

export const useDemoTourStore = create<DemoTourState>()((set, get) => {
  const apply = (snapshot: Snapshot) => {
    write(snapshot);
    set(snapshot);
  };
  return {
    ...read(),
    start(index = 0) {
      apply({ active: true, index: clampIndex(index), context: {} });
    },
    go(index) {
      if (index < 0 || index >= DEMO_STEPS.length) apply(EMPTY);
      else apply({ active: true, index, context: get().context });
    },
    stop() {
      apply(EMPTY);
    },
    setContext(patch) {
      const { active, index, context } = get();
      apply({ active, index, context: { ...context, ...patch } });
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
