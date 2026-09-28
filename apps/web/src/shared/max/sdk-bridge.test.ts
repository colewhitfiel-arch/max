import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaxSdkBridge, MaxSdkUnavailableError } from './sdk-bridge';

/** Минимальный мок глобала `WebApp`, который создаёт max-web-app.js. */
function installSdk(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  const sdk = {
    initData: 'auth_date=1&hash=abc&user=%7B%22id%22%3A7%7D',
    initDataUnsafe: {
      user: { id: 7, first_name: 'Алексей', last_name: 'Смирнов', language_code: 'ru' },
      start_param: 'club-42',
    },
    platform: 'ios',
    getViewportSize: () => ({ width: 390, height: 844 }),
    openLink: (url: string) => calls.push(`openLink:${url}`),
    openMaxLink: (url: string) => calls.push(`openMaxLink:${url}`),
    BackButton: {
      show: () => calls.push('back:show'),
      hide: () => calls.push('back:hide'),
      onClick: (handler: () => void) => calls.push('back:onClick') && void handler,
      offClick: () => calls.push('back:offClick'),
    },
    HapticFeedback: {
      impactOccurred: (style: string) => calls.push(`impact:${style}`),
      notificationOccurred: (type: string) => calls.push(`notify:${type}`),
    },
    DeviceStorage: {
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    ...overrides,
  };
  (window as unknown as Record<string, unknown>).WebApp = sdk;
  return { sdk, calls, store };
}

describe('MaxSdkBridge', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).WebApp;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('без глобала WebApp мост не падает, а работает как «вне MAX»', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(bridge.isInsideMax()).toBe(false);
    expect(bridge.getLaunchParams()).toBeNull();
    expect(bridge.getUser()).toBeNull();
    expect(bridge.getStartParam()).toBeNull();
    expect(() => bridge.haptic('light')).not.toThrow();
    expect(bridge.getViewport().width).toBeGreaterThanOrEqual(0);
    expect(warn).toHaveBeenCalled();
    expect(new MaxSdkUnavailableError().message).toContain('SDK MAX не найден');
  }, 10000);

  it('дожидается скрипта SDK, если он ещё не загрузился', async () => {
    const bridge = new MaxSdkBridge();
    const init = bridge.init();
    setTimeout(() => installSdk(), 80);
    await init;
    expect(bridge.isInsideMax()).toBe(true);
  });

  it('launch-параметры, start_param и пользователь читаются из initData', async () => {
    installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(bridge.getLaunchParams()).toContain('hash=abc');
    expect(bridge.getStartParam()).toBe('club-42');
    expect(bridge.getUser()).toEqual({
      id: '7',
      firstName: 'Алексей',
      lastName: 'Смирнов',
      locale: 'ru',
    });
  });

  it('вне MAX (SDK есть, initData пустой) isInsideMax = false', async () => {
    installSdk({ initData: '' });
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(bridge.isInsideMax()).toBe(false);
  });

  it('viewport берётся из getViewportSize', async () => {
    installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(bridge.getViewport()).toMatchObject({ width: 390, height: 844 });
  });

  it('ссылки на max.ru открываются через openMaxLink, остальные — через openLink', async () => {
    const { calls } = installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    bridge.openLink('https://max.ru/edu_bot');
    bridge.openLink('https://example.org/pay');
    expect(calls).toContain('openMaxLink:https://max.ru/edu_bot');
    expect(calls).toContain('openLink:https://example.org/pay');
  });

  it('haptic: success/error — notification, остальное — impact', async () => {
    const { calls } = installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    bridge.haptic('success');
    bridge.haptic('light');
    expect(calls).toContain('notify:success');
    expect(calls).toContain('impact:light');
  });

  it('подписка на back показывает системную кнопку, отписка — прячет', async () => {
    const { calls } = installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    const off = bridge.on('back', () => {});
    expect(calls).toContain('back:show');
    off();
    expect(calls).toContain('back:hide');
  });

  it('зависший DeviceStorage не вешает приложение: читаем локальную копию', async () => {
    installSdk({
      DeviceStorage: {
        setItem: () => new Promise(() => {}),
        getItem: () => new Promise(() => {}),
        removeItem: () => new Promise(() => {}),
      },
    });
    const bridge = new MaxSdkBridge();
    await bridge.init();
    await bridge.storage.set('k', 'v');
    expect(await bridge.storage.get('k')).toBe('v');
  }, 15000);

  it('DeviceStorage ответил «нет значения» — локальная копия (общая для аккаунтов) не подставляется', async () => {
    // В WebView остались токены другого MAX-аккаунта, а в DeviceStorage этого — пусто.
    localStorage.setItem('max:auth.refresh', 'r-other-account');
    installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(await bridge.storage.get('auth.refresh')).toBeNull();
  });

  it('DeviceStorage упал с ошибкой — читаем локальную копию', async () => {
    localStorage.setItem('max:k', 'v');
    installSdk({
      DeviceStorage: {
        setItem: () => Promise.reject(new Error('host')),
        getItem: () => Promise.reject(new Error('host')),
        removeItem: () => Promise.reject(new Error('host')),
      },
    });
    const bridge = new MaxSdkBridge();
    await bridge.init();
    expect(await bridge.storage.get('k')).toBe('v');
  });

  it('вне MAX хранилище мессенджера не используется', async () => {
    const { store } = installSdk({ initData: '' });
    const bridge = new MaxSdkBridge();
    await bridge.init();
    await bridge.storage.set('k', 'v');
    expect(store.size).toBe(0);
    expect(localStorage.getItem('max:k')).toBe('v');
  });

  it('storage работает через DeviceStorage мессенджера', async () => {
    const { store } = installSdk();
    const bridge = new MaxSdkBridge();
    await bridge.init();
    await bridge.storage.set('auth.access', 'token');
    expect(store.get('auth.access')).toBe('token');
    expect(await bridge.storage.get('auth.access')).toBe('token');
    await bridge.storage.remove('auth.access');
    expect(await bridge.storage.get('auth.access')).toBeNull();
  });

  it('без DeviceStorage падает на localStorage', async () => {
    installSdk({ DeviceStorage: undefined });
    const bridge = new MaxSdkBridge();
    await bridge.init();
    await bridge.storage.set('k', 'v');
    expect(localStorage.getItem('max:k')).toBe('v');
  });
});
