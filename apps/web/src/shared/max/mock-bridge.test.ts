import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockStorage, MockMaxBridge } from './mock-bridge';

describe('MockMaxBridge', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('storage: set/get/remove с префиксом в localStorage', async () => {
    const storage = createMockStorage('test:');
    await storage.set('auth.access', 'token');
    expect(await storage.get('auth.access')).toBe('token');
    expect(localStorage.getItem('test:auth.access')).toBe('token');
    await storage.remove('auth.access');
    expect(await storage.get('auth.access')).toBeNull();
    expect(localStorage.getItem('test:auth.access')).toBeNull();
  });

  it('storage: переживает недоступный localStorage (память)', async () => {
    const storage = createMockStorage('mem:');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
  });

  it('theme: из prefers-color-scheme и подписка на изменение', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => {
            listener = handler;
          },
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    const bridge = new MockMaxBridge({ launchParams: null });
    await bridge.init();
    expect(bridge.mode).toBe('mock');
    expect(bridge.isInsideMax()).toBe(false);
    expect(bridge.getTheme()).toBe('dark');

    const handler = vi.fn();
    const off = bridge.on('theme', handler);
    listener!({ matches: false } as MediaQueryListEvent);
    expect(handler).toHaveBeenCalledWith('light');
    off();
    listener!({ matches: true } as MediaQueryListEvent);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('launchParams: из опций или null', () => {
    expect(new MockMaxBridge({ launchParams: 'abc' }).getLaunchParams()).toBe('abc');
    expect(new MockMaxBridge({ launchParams: null }).getLaunchParams()).toBeNull();
  });
});
