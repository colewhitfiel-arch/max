import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiAuthAdapter, setApiAuthAdapter, unwrap } from './client';
import { ApiClientError } from './errors';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const ME = {
  user: {
    id: '00000000-0000-7000-8000-000000000011',
    firstName: 'Алексей',
    lastName: null,
    nickname: null,
    avatarUrl: null,
  },
  roles: ['STUDENT'],
  activeRole: 'STUDENT',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: null,
  teacher: null,
};

describe('api client', () => {
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

  it('unwrap возвращает body при 200 и подставляет Authorization и X-Request-Id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ME));
    const me = unwrap(await api.auth.getMe());
    expect(me.user.firstName).toBe('Алексей');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/me$/);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer old-access');
    expect(headers['X-Request-Id']).toBeTruthy();
  });

  it('ApiError → ApiClientError с кодом и requestId', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 'FORBIDDEN', message: 'Нет доступа', requestId: 'req-1' },
      }),
    );
    const result = await api.dashboards.getStudentHome();
    expect(() => unwrap(result)).toThrow(ApiClientError);
    try {
      unwrap(result);
    } catch (error) {
      const apiError = error as ApiClientError;
      expect(apiError.code).toBe('FORBIDDEN');
      expect(apiError.status).toBe(403);
      expect(apiError.requestId).toBe('req-1');
      expect(apiError.message).toBe('Нет доступа');
    }
  });

  it('404 без тела (ручки нет за прокси) → NOT_IMPLEMENTED (раздел в разработке)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await api.dashboards.getStudentHome();
    try {
      unwrap(result);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiClientError).code).toBe('NOT_IMPLEMENTED');
      expect((error as ApiClientError).status).toBe(404);
      expect((error as ApiClientError).isNotImplemented).toBe(true);
    }
  });

  it('404 с телом ApiError → NOT_FOUND («не найдено», не «раздел в разработке»)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Задание не найдено', requestId: 'req-2' },
      }),
    );
    const result = await api.dashboards.getStudentHome();
    try {
      unwrap(result);
      expect.unreachable();
    } catch (error) {
      expect((error as ApiClientError).code).toBe('NOT_FOUND');
      expect((error as ApiClientError).isNotImplemented).toBe(false);
    }
  });

  it('401 → refresh → повтор запроса с новым токеном', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, ME));

    const me = unwrap(await api.auth.getMe());
    expect(me.roles).toEqual(['STUDENT']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]!;
    expect(String(refreshUrl)).toMatch(/\/auth\/refresh$/);
    expect(refreshInit?.method).toBe('POST');
    expect(JSON.parse(String(refreshInit?.body))).toEqual({ refreshToken: 'refresh-1' });
    const refreshHeaders = Object.fromEntries(
      Object.entries(refreshInit?.headers as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    expect(refreshHeaders['content-type']).toBe('application/json');
    expect(refreshHeaders.authorization).toBeUndefined();

    expect(adapter.onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'refresh-2',
    });
    const retryHeaders = fetchMock.mock.calls[2]![1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-access');
    expect(adapter.onUnauthorized).not.toHaveBeenCalled();
  });

  it('401 и неудачный refresh → onUnauthorized, ошибка UNAUTHORIZED', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'bad refresh' } }),
      );
    const result = await api.auth.getMe();
    expect(result.status).toBe(401);
    expect(adapter.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(() => unwrap(result)).toThrow(ApiClientError);
  });

  it('401 и сетевой сбой refresh → сессию не трогаем, ошибка EXTERNAL_INTEGRATION', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.auth.getMe()).rejects.toMatchObject({
      code: 'EXTERNAL_INTEGRATION',
      status: 0,
    });
    expect(adapter.onUnauthorized).not.toHaveBeenCalled();
    expect(adapter.onTokensRefreshed).not.toHaveBeenCalled();
    expect(adapter.refresh).toBe('refresh-1');
  });

  it('401 и 503 на refresh → ответ 503 (TanStack ретраит), без onUnauthorized', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await api.auth.getMe();
    expect(result.status).toBe(503);
    expect(adapter.onUnauthorized).not.toHaveBeenCalled();
    expect(() => unwrap(result)).toThrow(
      expect.objectContaining({ code: 'EXTERNAL_INTEGRATION', status: 503 }),
    );
  });

  it('сетевая ошибка → ApiClientError EXTERNAL_INTEGRATION', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.health.getHealth()).rejects.toMatchObject({ code: 'EXTERNAL_INTEGRATION' });
  });
});
