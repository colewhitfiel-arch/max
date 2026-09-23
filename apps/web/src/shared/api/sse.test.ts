import type { AiStreamEvent } from '@edu/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiAuthAdapter, setApiAuthAdapter } from './client';
import { streamSse, useAiStream } from './sse';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const MESSAGE_ID = '00000000-0000-7000-8000-000000000099';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: AiStreamEvent[]) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const unauthorized = () =>
  jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });

const authHeader = (call: Parameters<typeof fetch> | undefined) =>
  (call?.[1]?.headers as Record<string, string> | undefined)?.Authorization;

describe('streamSse: авторизация', () => {
  let fetchMock: FetchMock;
  let adapter: ApiAuthAdapter & { access: string | null; refresh: string | null };

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    adapter = {
      access: 'old-access',
      refresh: 'refresh-1',
      getAccessToken: () => adapter.access,
      getRefreshToken: () => adapter.refresh,
      onTokensRefreshed: vi.fn((tokens) => {
        adapter.access = tokens.accessToken;
        adapter.refresh = tokens.refreshToken;
      }),
      onUnauthorized: vi.fn(),
    };
    setApiAuthAdapter(adapter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthAdapter(null);
  });

  it('401 → refresh → повтор стрима с новым токеном', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }),
      )
      .mockResolvedValueOnce(
        sseResponse([
          { type: 'token', text: 'При' },
          { type: 'token', text: 'вет' },
          { type: 'done', messageId: MESSAGE_ID },
        ]),
      );
    const events: AiStreamEvent[] = [];

    await streamSse({
      path: '/ai/conversations/c1/messages',
      body: { text: 'hi' },
      onEvent: (e) => events.push(e),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer old-access');
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/auth\/refresh$/);
    expect(authHeader(fetchMock.mock.calls[2])).toBe('Bearer new-access');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ text: 'hi' }));
    expect(events.map((e) => e.type)).toEqual(['token', 'token', 'done']);
    expect(adapter.onUnauthorized).not.toHaveBeenCalled();
  });

  it('401 и отказ refresh → onUnauthorized и ошибка UNAUTHORIZED', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());

    await expect(
      streamSse({ path: '/ai/conversations/c1/messages', body: {}, onEvent: () => {} }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(adapter.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('401 и сетевой сбой refresh → EXTERNAL_INTEGRATION без выхода из сессии', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      streamSse({ path: '/ai/conversations/c1/messages', body: {}, onEvent: () => {} }),
    ).rejects.toMatchObject({ code: 'EXTERNAL_INTEGRATION' });
    expect(adapter.onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('useAiStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('прерванный предыдущий стрим не затирает состояние нового', async () => {
    let releaseSecond: (response: Response) => void = () => {};
    const fetchMock = vi
      .fn<typeof fetch>()
      // Первый стрим висит до abort.
      .mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      )
      // Второй — отвечает, когда отпустим.
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            releaseSecond = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAiStream());

    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.start('/ai/conversations/c1/messages', { text: '1' });
    });
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      second = result.current.start('/ai/conversations/c1/messages', { text: '2' });
    });
    await act(async () => {
      await first;
    });

    // Первый стрим отклонён после abort, но второй всё ещё идёт.
    expect(result.current.status).toBe('streaming');

    await act(async () => {
      releaseSecond(
        sseResponse([
          { type: 'token', text: 'Второй' },
          { type: 'done', messageId: MESSAGE_ID },
        ]),
      );
      await second;
    });
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.text).toBe('Второй');
  });

  it('«Стоп» (abort) текущего стрима → status done с накопленным текстом', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAiStream());

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.start('/ai/conversations/c1/messages', {});
    });
    await act(async () => {
      result.current.abort();
      await pending;
    });

    expect(result.current.status).toBe('done');
  });
});
