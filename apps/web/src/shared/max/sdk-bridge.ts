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
 *  - облачного хранилища: используем `DeviceStorage` (на устройстве), fallback — localStorage
 *    с префиксом MAX-аккаунта запуска (`max:<id>:`).
 */
import { i18n } from '@/shared/i18n';
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

/**
 * Методы хранилища MAX: могут вернуть значение синхронно или промисом — поддерживаем оба.
 * `getItem` по типам MAX Bridge отвечает `{ key, value }`, но встречается и голая строка
 * (см. `storedValue`).
 */
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
  /**
   * Встроенный сканер QR: `fileSelect=false` — только камера. Отвечает `{ value }` (строка из
   * кода), отказ — `{ error: { code } }`.
   */
  openCodeReader?: (fileSelect?: boolean) => Promise<unknown>;
}

/** Строка из ответа `openCodeReader`: `{ value }` по документации MAX, на всякий случай и голая строка. */
function scannedValue(answer: unknown): string | null {
  const raw =
    answer !== null && typeof answer === 'object' && 'value' in answer
      ? (answer as { value: unknown }).value
      : answer;
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

/** Код отказа сканера (`{ error: { code } }`); закрытие без кода — не ошибка, а «ничего». */
function isScanCancelled(cause: unknown): boolean {
  const code =
    cause !== null && typeof cause === 'object' && 'error' in cause
      ? (cause as { error?: { code?: unknown } }).error?.code
      : undefined;
  return typeof code === 'string' && /cancel|close|abort|dismiss/i.test(code);
}

/** Оставлена для обратной совместимости: мост больше не падает без SDK, а работает «вне MAX». */
export class MaxSdkUnavailableError extends Error {
  constructor() {
    super(i18n.t('common:errors.sdkUnavailable'));
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
 * Ключи сессии, которые до разделения копий по аккаунтам лежали под общим `max:`. Их общая копия
 * внутри MAX больше не читается, но токены в ней ещё действительны — стираем при первом запуске
 * с известным аккаунтом (список дублирует ключи shared/auth: мост от auth не зависит).
 */
const LEGACY_SHARED_SESSION_KEYS = ['auth.access', 'auth.refresh', 'auth.maxUser'];

/** Префикс локальной копии хранилища; внутри MAX — свой у каждого аккаунта (`max:<id>:`). */
function localPrefix(maxUserId: string | null): string {
  return maxUserId ? `max:${maxUserId}:` : 'max:';
}

/**
 * Ответ `DeviceStorage.getItem` → значение: строка или объект `{ key, value }` (так в типах
 * MAX Bridge). Пустая строка, `null` и прочее — «нет значения».
 */
function storedValue(answer: unknown): string | null {
  const raw =
    answer !== null && typeof answer === 'object' && 'value' in answer
      ? (answer as { value: unknown }).value
      : answer;
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/**
 * `DeviceStorage` MAX за нашим интерфейсом.
 *
 * Методы хранилища — запрос к хост-приложению: вне MAX (и если мессенджер не ответил) промис
 * не разрешается никогда. Поэтому каждый вызов ограничен таймаутом, а рядом ведётся зеркало в
 * localStorage — приложение не зависает на старте и продолжает работать с локальной копией.
 * Зеркало читается только при таймауте или ошибке: если хранилище ответило «нет значения»,
 * так и есть. Зеркало своё у каждого MAX-аккаунта (`localPrefix`): WebView бывает общим у
 * нескольких аккаунтов, и общая копия отдала бы одному аккаунту токены другого.
 */
function createDeviceStorage(device: MaxStorageSdk, maxUserId: string | null): MaxStorage {
  const local = createMockStorage(localPrefix(maxUserId));
  const guard = <T>(value: unknown, fallback: T): Promise<T> =>
    Promise.race([
      Promise.resolve(value as T).catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), STORAGE_TIMEOUT_MS)),
    ]);
  const noAnswer = Symbol('no-answer');
  return {
    async get(key) {
      let value: unknown;
      try {
        value = await guard<unknown>(device.getItem(key), noAnswer);
      } catch {
        value = noAnswer;
      }
      if (value === noAnswer) return local.get(key);
      return storedValue(value);
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
    // До init() и вне MAX — хранилище WebView под общим префиксом.
    this.storage = createMockStorage(localPrefix(null));
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
    if (!this.isInsideMax()) return;
    // Локальная копия — своя у каждого MAX-аккаунта: WebView (или браузер с web.max.ru) бывает
    // общим. Сохранённое до этого под общим `max:` внутри MAX больше не читается (токены сессии
    // оттуда стираются) — один раз войдём заново по launch-параметрам.
    const maxUserId = this.getUser()?.id || null;
    if (maxUserId) {
      const legacy = createMockStorage(localPrefix(null));
      await Promise.all(LEGACY_SHARED_SESSION_KEYS.map((key) => legacy.remove(key)));
    }
    this.storage = this.sdk.DeviceStorage
      ? createDeviceStorage(this.sdk.DeviceStorage, maxUserId)
      : createMockStorage(localPrefix(maxUserId));
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

  canScanQrCode(): boolean {
    return this.isInsideMax() && typeof this.sdk?.openCodeReader === 'function';
  }

  /**
   * Сканер MAX: камера и распознавание — на стороне мессенджера. Только камера (`fileSelect`
   * выключен): отмечаются по коду на экране преподавателя, а не по пересланному снимку.
   */
  async scanQrCode(): Promise<string | null> {
    const sdk = this.sdk;
    if (!sdk?.openCodeReader || !this.isInsideMax())
      throw new Error('[max-bridge] сканер QR недоступен вне MAX');
    try {
      return scannedValue(await sdk.openCodeReader(false));
    } catch (cause) {
      if (isScanCancelled(cause)) return null;
      const code =
        cause !== null && typeof cause === 'object' && 'error' in cause
          ? String((cause as { error?: { code?: unknown } }).error?.code ?? '')
          : '';
      throw new Error(`[max-bridge] сканер QR не открылся${code ? `: ${code}` : ''}`, { cause });
    }
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
