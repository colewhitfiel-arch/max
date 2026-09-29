import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installClientErrorReporting,
  reportClientError,
  resetClientErrorReportingForTests,
} from './client-errors';

const API = 'http://api.test/api/v1';

describe('client-errors', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    resetClientErrorReportingForTests();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.unstubAllGlobals();
  });

  it('отправляет отчёт на /client-errors и не дублирует ту же ошибку подряд', () => {
    reportClientError(API, 'error', new Error('boom'));
    reportClientError(API, 'error', new Error('boom'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/client-errors`);
    const body = JSON.parse(String(init.body)) as { kind: string; message: string; stack?: string };
    expect(body).toMatchObject({ kind: 'error', message: 'boom' });
    expect(body.stack).toContain('boom');
  });

  it('необработанная ошибка окна → отчёт, а при пустом #root — экран сбоя', async () => {
    const onFatal = vi.fn();
    uninstall = installClientErrorReporting({ apiUrl: API, onFatal });
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('render died') }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it('если приложение отрисовано, экран сбоя не подменяет его', async () => {
    const onFatal = vi.fn();
    document.body.innerHTML = '<div id="root"><main>ok</main></div>';
    uninstall = installClientErrorReporting({ apiUrl: API, onFatal });
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('minor') }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onFatal).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('устаревший чанк после деплоя → перезагрузка один раз, без отчёта', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload, href: 'http://app/' });
    uninstall = installClientErrorReporting({ apiUrl: API });
    const event = new Event('vite:preloadError');
    (event as Event & { payload?: unknown }).payload = new Error(
      'Failed to fetch dynamically imported module: /assets/x.js',
    );
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // Второй раз за сессию — уже не перезагружаем, а сообщаем
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
