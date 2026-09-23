/**
 * Каркас адаптера под реальный SDK мини-приложений MAX.
 *
 * TODO(max-sdk): точный API SDK неизвестен на момент foundation — сверить с dev.max.ru:
 *  - как подключается SDK (npm-пакет или `<script>` с глобальным объектом), имя глобала;
 *  - формат launch-параметров и подписи для `POST /auth/max`;
 *  - события темы/viewport/back, методы haptic/openLink/close/ready;
 *  - есть ли облачное key-value хранилище (иначе — localStorage).
 * Все места подключения помечены `TODO(max-sdk)`. При отсутствии SDK бросается понятная ошибка
 * с рекомендацией `VITE_MAX_MODE=mock`.
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

/** Предполагаемая форма глобального объекта SDK. TODO(max-sdk): уточнить типы по документации. */
interface MaxWebAppSdk {
  initData?: string;
  initDataRaw?: string;
  colorScheme?: 'light' | 'dark';
  viewportHeight?: number;
  viewportWidth?: number;
  safeAreaInset?: { top?: number; bottom?: number };
  initDataUnsafe?: { user?: Record<string, unknown> };
  ready?: () => void;
  close?: () => void;
  openLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred?: (style: string) => void;
    notificationOccurred?: (type: string) => void;
  };
  onEvent?: (event: string, handler: (...args: unknown[]) => void) => void;
  offEvent?: (event: string, handler: (...args: unknown[]) => void) => void;
  CloudStorage?: {
    getItem: (key: string, cb: (err: unknown, value?: string | null) => void) => void;
    setItem: (key: string, value: string, cb?: (err: unknown) => void) => void;
    removeItem: (key: string, cb?: (err: unknown) => void) => void;
  };
}

/** TODO(max-sdk): имена глобалов, под которыми SDK доступен в WebView. */
const GLOBAL_CANDIDATES = ['WebApp', 'Max', 'MaxWebApp'] as const;

export class MaxSdkUnavailableError extends Error {
  constructor() {
    super(i18n.t('common:errors.sdkUnavailable'));
    this.name = 'MaxSdkUnavailableError';
  }
}

function findSdk(): MaxWebAppSdk | null {
  if (typeof window === 'undefined') return null;
  const global = window as unknown as Record<string, unknown>;
  for (const name of GLOBAL_CANDIDATES) {
    const candidate = global[name];
    if (candidate && typeof candidate === 'object') return candidate as MaxWebAppSdk;
  }
  // TODO(max-sdk): вариант с npm-пакетом — динамический import и возврат его экземпляра.
  return null;
}

export class MaxSdkBridge implements MaxBridge {
  readonly mode = 'real' as const;
  readonly storage: MaxStorage;
  private sdk: MaxWebAppSdk | null = null;

  constructor() {
    // До init() и при отсутствии CloudStorage — локальное хранилище WebView.
    this.storage = createMockStorage('max:');
  }

  async init(): Promise<void> {
    this.sdk = findSdk();
    if (!this.sdk) throw new MaxSdkUnavailableError();
    if (this.sdk.CloudStorage) {
      // TODO(max-sdk): переключить storage на облачное хранилище, если SDK его даёт.
    }
  }

  private requireSdk(): MaxWebAppSdk {
    if (!this.sdk) throw new MaxSdkUnavailableError();
    return this.sdk;
  }

  isInsideMax(): boolean {
    return this.sdk !== null;
  }

  getLaunchParams(): string | null {
    const sdk = this.requireSdk();
    // TODO(max-sdk): поле с подписанными launch-параметрами.
    return sdk.initDataRaw ?? sdk.initData ?? null;
  }

  getUser(): MaxUser | null {
    const raw = this.requireSdk().initDataUnsafe?.user;
    if (!raw) return null;
    // TODO(max-sdk): маппинг полей пользователя SDK → MaxUser.
    return {
      id: String(raw.id ?? ''),
      firstName: String(raw.first_name ?? raw.firstName ?? ''),
      lastName: (raw.last_name ?? raw.lastName) as string | undefined,
      username: raw.username as string | undefined,
      avatarUrl: (raw.photo_url ?? raw.avatarUrl) as string | undefined,
      locale: (raw.language_code ?? raw.locale) as string | undefined,
    };
  }

  getTheme(): MaxTheme {
    return this.requireSdk().colorScheme === 'dark' ? 'dark' : 'light';
  }

  getViewport(): MaxViewport {
    const sdk = this.requireSdk();
    return {
      width: sdk.viewportWidth ?? window.innerWidth,
      height: sdk.viewportHeight ?? window.innerHeight,
      safeArea: { top: sdk.safeAreaInset?.top ?? 0, bottom: sdk.safeAreaInset?.bottom ?? 0 },
    };
  }

  ready(): void {
    this.requireSdk().ready?.();
  }

  close(): void {
    this.requireSdk().close?.();
  }

  openLink(url: string): void {
    const sdk = this.requireSdk();
    if (sdk.openLink) sdk.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  haptic(kind: HapticKind): void {
    const haptic = this.requireSdk().HapticFeedback;
    if (!haptic) return;
    // TODO(max-sdk): соответствие видов haptic методам SDK.
    if (kind === 'success' || kind === 'error') haptic.notificationOccurred?.(kind);
    else haptic.impactOccurred?.(kind);
  }

  on<E extends MaxBridgeEvent>(event: E, handler: MaxEventHandler<E>): () => void {
    const sdk = this.requireSdk();
    // TODO(max-sdk): названия событий SDK (themeChanged / viewportChanged / backButtonClicked).
    const sdkEvent = {
      theme: 'themeChanged',
      viewport: 'viewportChanged',
      back: 'backButtonClicked',
    }[event];
    const wrapped = () => {
      if (event === 'theme') (handler as MaxEventHandler<'theme'>)(this.getTheme());
      else if (event === 'viewport') (handler as MaxEventHandler<'viewport'>)(this.getViewport());
      else (handler as MaxEventHandler<'back'>)();
    };
    sdk.onEvent?.(sdkEvent, wrapped);
    return () => sdk.offEvent?.(sdkEvent, wrapped);
  }
}
