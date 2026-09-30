/**
 * Адаптер MAX Bridge (docs/02 §2.8). Единственная точка контакта с мессенджером:
 * launch-параметры, тема, viewport, storage, haptic, ссылки. Вне MAX — mock-реализация.
 */
export type MaxBridgeMode = 'mock' | 'real';
export type MaxTheme = 'light' | 'dark';
export type HapticKind = 'light' | 'medium' | 'success' | 'error';
export type MaxBridgeEvent = 'theme' | 'viewport' | 'back';

export interface MaxUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  avatarUrl?: string;
  locale?: string;
}

export interface MaxViewport {
  width: number;
  height: number;
  safeArea: { top: number; bottom: number };
}

export interface MaxStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type MaxEventHandler<E extends MaxBridgeEvent> = E extends 'theme'
  ? (theme: MaxTheme) => void
  : E extends 'viewport'
    ? (viewport: MaxViewport) => void
    : () => void;

export interface MaxBridge {
  readonly mode: MaxBridgeMode;
  /** Инициализация SDK; вызывается один раз до рендера. */
  init(): Promise<void>;
  /** true — приложение открыто внутри MAX (не в обычном браузере). */
  isInsideMax(): boolean;
  /** Сырые launch-параметры для `POST /auth/max`; null — их нет. */
  getLaunchParams(): string | null;
  /** Полезная нагрузка диплинка `https://max.ru/<bot>?startapp=<payload>`; null — запуск без неё. */
  getStartParam(): string | null;
  getUser(): MaxUser | null;
  getTheme(): MaxTheme;
  getViewport(): MaxViewport;
  /** Сообщить MAX, что приложение готово (скрыть сплэш мессенджера). */
  ready(): void;
  close(): void;
  openLink(url: string): void;
  haptic(kind: HapticKind): void;
  /**
   * Есть встроенный сканер QR-кодов мессенджера (внутри MAX с `openCodeReader`). Вне MAX —
   * false: фича предлагает ввести код вручную.
   */
  canScanQrCode(): boolean;
  /**
   * Открыть встроенный сканер MAX — только камера, без выбора снимка из галереи. Строка из
   * кода; null — сканер закрыли, ничего не отсканировав. Бросает, если сканер не открылся.
   */
  scanQrCode(): Promise<string | null>;
  storage: MaxStorage;
  /** Подписка на события; возвращает функцию отписки. */
  on<E extends MaxBridgeEvent>(event: E, handler: MaxEventHandler<E>): () => void;
}
