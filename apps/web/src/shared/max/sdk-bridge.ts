/**
 * Адаптер реального SDK мини-приложений MAX (dev.max.ru/docs/webapps, сверено 2026-09-24).
 *
 * SDK подключается тегом `<script src="https://st.max.ru/js/max-web-app.js">` в `index.html`
 * и кладёт в окно глобальный объект `WebApp`. Инициализация ему не нужна, но скрипт грузится
 * асинхронно, поэтому `init()` ждёт появления глобала.
 *
 * Чего в SDK MAX нет (в отличие от Telegram), и как это закрыто здесь:
 *  - темы: WebView наследует оформление мессенджера, читаем `prefers-color-scheme`;
 *  - `ready()` / `close()`: сплэш скрывается сам, окно закрывает пользователь — заглушки;
 *  - облачного хранилища: используем `DeviceStorage` (на устройстве), fallback — localStorage.
 */
import { createMockStorage } from './mock-bridge';
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

/** Имя глобала, который создаёт `max-web-app.js`. */
const GLOBAL_NAME = 'WebApp';
/** Сколько ждать загрузки скрипта SDK при старте. */
const SDK_WAIT_MS = 3000;
const SDK_POLL_MS = 50;
/** Потолок ожидания ответа хранилища мессенджера — дальше работаем с локальной копией. */
const STORAGE_TIMEOUT_MS = 2000;
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Методы хранилища MAX: могут вернуть значение синхронно или промисом — поддерживаем оба. */
interface MaxStorageSdk {
  setItem(key: string, value: string): unknown;
  getItem(key: string): unknown;
  removeItem(key: string): unknown;
  clear?(): unknown;
}

/** Форма `window.WebApp`; поля необязательны — версии MAX отличаются составом API. */
interface MaxWebAppSdk {
  /** Подписанная строка для проверки на сервере (`POST /auth/max`). */
  initData?: string;
  /** Разобранные данные запуска; подписью не защищены — только для UI. */
  initDataUnsafe?: {
    user?: Record<string, unknown>;
    chat?: Record<string, unknown>;
    start_param?: string;
  };
  platform?: string;
  version?: string;
  deviceName?: string;
  getLaunchContext?: () => Promise<{ entryPoint?: string }>;
  getViewportSize?: () => { width?: number; height?: number } | undefined;
  openLink?: (url: string) => void;
  openMaxLink?: (url: string) => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (handler: () => void) => void;
    offClick?: (handler: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: string, disableVibrationFallback?: boolean) => void;
    notificationOccurred?: (type: string, disableVibrationFallback?: boolean) => void;
  };
  DeviceStorage?: MaxStorageSdk;
  SecureStorage?: MaxStorageSdk;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

/** Оставлена для обратной совместимости: мост больше не падает без SDK, а работает «вне MAX». */
export class MaxSdkUnavailableError extends Error {
  constructor() {
    super('SDK MAX не найден: приложение открыто вне MAX или не загрузился max-web-app.js.');
    this.name = 'MaxSdkUnavailableError';
  }
}

function readSdk(): MaxWebAppSdk | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as Record<string, unknown>)[GLOBAL_NAME];
  return candidate && typeof candidate === 'object' ? (candidate as MaxWebAppSdk) : null;
}

/** Ждёт появления глобала: скрипт SDK подключён обычным (не module) тегом и грузится асинхронно. */
async function waitForSdk(timeoutMs: number): Promise<MaxWebAppSdk | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const sdk = readSdk();
    if (sdk) return sdk;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, SDK_POLL_MS));
  }
}

/**
 * `DeviceStorage` MAX за нашим интерфейсом.
 *
 * Методы хранилища — запрос к хост-приложению: вне MAX (и если мессенджер не ответил) промис
 * не разрешается никогда. Поэтому каждый вызов ограничен таймаутом, а рядом ведётся зеркало в
 * localStorage — приложение не зависает на старте и продолжает работать с локальной копией.
 */
function createDeviceStorage(device: MaxStorageSdk): MaxStorage {
  const local = createMockStorage('max:');
  const guard = <T>(value: unknown, fallback: T): Promise<T> =>
    Promise.race([
      Promise.resolve(value as T).catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), STORAGE_TIMEOUT_MS)),
    ]);
  return {
    async get(key) {
      const local_ = await local.get(key);
      const value = await guard<unknown>(device.getItem(key), local_);
      return typeof value === 'string' ? value : local_;
    },
    async set(key, value) {
      await local.set(key, value);
      await guard(device.setItem(key, value), undefined);
    },
    async remove(key) {
      await local.remove(key);
      await guard(device.removeItem(key), undefined);
    },
  };
}

export class MaxSdkBridge implements MaxBridge {
  readonly mode = 'real' as const;
  storage: MaxStorage;
  private sdk: MaxWebAppSdk | null = null;

  constructor() {
    // До init() (и если SDK без DeviceStorage) — хранилище WebView.
    this.storage = createMockStorage('max:');
  }

  /**
   * Никогда не падает: если скрипт SDK не загрузился (открыли в обычном браузере, нет доступа
   * к st.max.ru), мост просто работает как «вне MAX» — приложение покажет обычный вход.
   */
  async init(): Promise<void> {
    this.sdk = await waitForSdk(SDK_WAIT_MS);
    if (!this.sdk) {
      console.warn('[max-bridge]', new MaxSdkUnavailableError().message);
      return;
    }
    // Хранилище мессенджера имеет смысл только внутри MAX: вне его запросы к хосту не отвечают.
    if (this.isInsideMax() && this.sdk.DeviceStorage) {
      this.storage = createDeviceStorage(this.sdk.DeviceStorage);
    }
  }

  /** Внутри MAX, только если SDK отдал подписанные данные запуска. */
  isInsideMax(): boolean {
    return Boolean(this.sdk?.initData);
  }

  getLaunchParams(): string | null {
    return this.sdk?.initData ?? null;
  }

  getUser(): MaxUser | null {
    const raw = this.sdk?.initDataUnsafe?.user;
    if (!raw) return null;
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value : undefined;
    const user: MaxUser = {
      id: String(raw.id ?? ''),
      firstName: text(raw.first_name) ?? text(raw.firstName) ?? '',
    };
    const lastName = text(raw.last_name) ?? text(raw.lastName);
    const username = text(raw.username);
    const avatarUrl = text(raw.photo_url) ?? text(raw.avatarUrl);
    const locale = text(raw.language_code) ?? text(raw.locale);
    if (lastName) user.lastName = lastName;
    if (username) user.username = username;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    if (locale) user.locale = locale;
    return user;
  }

  /** Полезная нагрузка диплинка `https://max.ru/<bot>?startapp=<payload>`. */
  getStartParam(): string | null {
    return this.sdk?.initDataUnsafe?.start_param ?? null;
  }

  /** Тема мессенджера: отдельного API у MAX нет, WebView наследует оформление системы. */
  getTheme(): MaxTheme {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  }

  getViewport(): MaxViewport {
    const size = this.sdk?.getViewportSize?.();
    return {
      width: size?.width ?? window.innerWidth,
      height: size?.height ?? window.innerHeight,
      // Отступы безопасной зоны SDK не отдаёт — их закрывает CSS (env(safe-area-inset-*)).
      safeArea: { top: 0, bottom: 0 },
    };
  }

  /** В MAX сплэш снимается сам — метод оставлен для совместимости интерфейса. */
  ready(): void {}

  /** Мини-приложение закрывает пользователь; программного закрытия в SDK нет. */
  close(): void {}

  openLink(url: string): void {
    // Ссылки внутрь MAX (max.ru/...) открываем без выхода из мессенджера.
    const isMaxLink = /^https:\/\/max\.ru\//.test(url);
    if (isMaxLink && this.sdk?.openMaxLink) this.sdk.openMaxLink(url);
    else if (this.sdk?.openLink) this.sdk.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  haptic(kind: HapticKind): void {
    const haptic = this.sdk?.HapticFeedback;
    if (!haptic) return;
    if (kind === 'success' || kind === 'error') haptic.notificationOccurred?.(kind);
    else haptic.impactOccurred?.(kind);
  }

  on<E extends MaxBridgeEvent>(event: E, handler: MaxEventHandler<E>): () => void {
    if (event === 'back') return this.onBack(handler as MaxEventHandler<'back'>);
    if (event === 'theme') return this.onTheme(handler as MaxEventHandler<'theme'>);
    return this.onViewport(handler as MaxEventHandler<'viewport'>);
  }

  /** Системная кнопка «назад» MAX: показываем, пока есть подписчик. */
  private onBack(handler: MaxEventHandler<'back'>): () => void {
    const button = this.sdk?.BackButton;
    if (!button?.onClick) return () => {};
    button.onClick(handler);
    button.show?.();
    return () => {
      button.offClick?.(handler);
      button.hide?.();
    };
  }

  private onTheme(handler: MaxEventHandler<'theme'>): () => void {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const media = window.matchMedia(DARK_QUERY);
    const listener = () => handler(media.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }

  private onViewport(handler: MaxEventHandler<'viewport'>): () => void {
    if (typeof window === 'undefined') return () => {};
    const listener = () => handler(this.getViewport());
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }
}
