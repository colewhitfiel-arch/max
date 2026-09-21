/**
 * MAX Bridge для обычного браузера: storage = localStorage с префиксом, тема — prefers-color-scheme,
 * viewport — window, launch-параметры — из `?launchParams=` в URL.
 */
import type {
  HapticKind,
  MaxBridge,
  MaxBridgeEvent,
  MaxEventHandler,
  MaxStorage,
  MaxTheme,
  MaxUser,
  MaxViewport,
} from './types';

const STORAGE_PREFIX = 'max-mock:';
const DARK_QUERY = '(prefers-color-scheme: dark)';

type Handlers = { [E in MaxBridgeEvent]: Set<MaxEventHandler<E>> };

/** Хранилище на localStorage; при недоступности (private mode) — in-memory. */
export function createMockStorage(prefix = STORAGE_PREFIX): MaxStorage {
  const memory = new Map<string, string>();
  const local = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    async get(key) {
      try {
        const stored = local()?.getItem(prefix + key);
        if (stored != null) return stored;
      } catch {
        /* localStorage недоступен — читаем из памяти */
      }
      return memory.get(key) ?? null;
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        local()?.setItem(prefix + key, value);
      } catch {
        /* quota / private mode — остаёмся в памяти */
      }
    },
    async remove(key) {
      memory.delete(key);
      try {
        local()?.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
  };
}

export interface MockBridgeOptions {
  /** Переопределить launch-параметры (по умолчанию — из URL). */
  launchParams?: string | null;
  user?: MaxUser | null;
  storage?: MaxStorage;
}

export class MockMaxBridge implements MaxBridge {
  readonly mode = 'mock' as const;
  readonly storage: MaxStorage;
  private readonly handlers: Handlers = { theme: new Set(), viewport: new Set(), back: new Set() };
  private readonly launchParams: string | null;
  private readonly user: MaxUser | null;
  private media: MediaQueryList | null = null;
  private initialized = false;

  constructor(options: MockBridgeOptions = {}) {
    this.storage = options.storage ?? createMockStorage();
    this.launchParams =
      options.launchParams !== undefined ? options.launchParams : readLaunchParamsFromUrl();
    this.user = options.user ?? null;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia === 'function') {
      this.media = window.matchMedia(DARK_QUERY);
      this.media.addEventListener?.('change', this.onMediaChange);
    }
    window.addEventListener('resize', this.onResize);
    // Событие `back` в браузере не эмулируем: историю обрабатывает сам роутер (popstate).
  }

  isInsideMax(): boolean {
    return false;
  }

  getLaunchParams(): string | null {
    return this.launchParams;
  }

  getUser(): MaxUser | null {
    return this.user;
  }

  getTheme(): MaxTheme {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  }

  getViewport(): MaxViewport {
    if (typeof window === 'undefined')
      return { width: 0, height: 0, safeArea: { top: 0, bottom: 0 } };
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      safeArea: { top: 0, bottom: 0 },
    };
  }

  ready(): void {
    // eslint-disable-next-line no-console -- намеренная трассировка mock-bridge
    console.debug('[max-bridge:mock] ready()');
  }

  close(): void {
    // eslint-disable-next-line no-console -- намеренная трассировка mock-bridge
    console.debug('[max-bridge:mock] close()');
  }

  openLink(url: string): void {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  }

  haptic(kind: HapticKind): void {
    // eslint-disable-next-line no-console -- намеренная трассировка mock-bridge
    console.debug(`[max-bridge:mock] haptic(${kind})`);
  }

  on<E extends MaxBridgeEvent>(event: E, handler: MaxEventHandler<E>): () => void {
    const set = this.handlers[event] as Set<MaxEventHandler<E>>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  /** Для тестов и dev-панели: принудительно разослать событие темы. */
  emitTheme(theme: MaxTheme): void {
    this.handlers.theme.forEach((handler) => handler(theme));
  }

  /** Для тестов: эмуляция системной кнопки «назад». */
  emitBack(): void {
    this.handlers.back.forEach((handler) => handler());
  }

  private onMediaChange = (event: MediaQueryListEvent) => {
    this.emitTheme(event.matches ? 'dark' : 'light');
  };

  private onResize = () => {
    const viewport = this.getViewport();
    this.handlers.viewport.forEach((handler) => handler(viewport));
  };
}

function readLaunchParamsFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search).get('launchParams');
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
