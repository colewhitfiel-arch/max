import type { AuthResult, MeDto } from '@edu/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ClientModule from '../api/client';
import { MockMaxBridge } from '../max/mock-bridge';

const mocks = vi.hoisted(() => ({
  loginDev: vi.fn(),
  switchRole: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, api: { auth: mocks } };
});

import {
  AUTH_STORAGE_KEYS,
  bootstrapAuth,
  configureAuthStorage,
  resetAuthStore,
  useAuthStore,
} from './store';

const me = (activeRole: MeDto['activeRole']): MeDto => ({
  user: {
    id: '00000000-0000-7000-8000-000000000010',
    firstName: 'Мария',
    lastName: 'Иванова',
    nickname: null,
    avatarUrl: null,
  },
  roles: ['TEACHER', 'PARENT'],
  activeRole,
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: { id: '00000000-0000-7000-8000-000000000024', childrenCount: 1 },
  teacher: {
    id: '00000000-0000-7000-8000-000000000020',
    schoolId: '00000000-0000-7000-8000-000000000001',
  },
});

const ok = <T>(body: T) => ({ status: 200, body, headers: new Headers() });

describe('auth store', () => {
  let bridge: MockMaxBridge;
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    bridge = new MockMaxBridge({
      launchParams: null,
      storage: {
        get: async (key) => memory.get(key) ?? null,
        set: async (key, value) => void memory.set(key, value),
        remove: async (key) => void memory.delete(key),
      },
    });
    resetAuthStore();
    configureAuthStorage(bridge.storage);
    vi.clearAllMocks();
  });

  it('loginDev сохраняет токены в bridge.storage и me в store', async () => {
    const result: AuthResult = { accessToken: 'a1', refreshToken: 'r1', me: me('TEACHER') };
    mocks.loginDev.mockResolvedValueOnce(ok(result));

    await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER', 'PARENT']);

    expect(mocks.loginDev).toHaveBeenCalledWith({
      body: { maxUserId: 'max-teacher-1', roles: ['TEACHER', 'PARENT'] },
    });
    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.me?.activeRole).toBe('TEACHER');
    expect(await bridge.storage.get(AUTH_STORAGE_KEYS.access)).toBe('a1');
    expect(await bridge.storage.get(AUTH_STORAGE_KEYS.refresh)).toBe('r1');
  });

  it('logout чистит store и storage', async () => {
    mocks.loginDev.mockResolvedValueOnce(
      ok({ accessToken: 'a1', refreshToken: 'r1', me: me('TEACHER') }),
    );
    mocks.logout.mockResolvedValueOnce({ status: 204, body: undefined, headers: new Headers() });
    await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);

    await useAuthStore.getState().logout();

    expect(mocks.logout).toHaveBeenCalledWith({ body: { refreshToken: 'r1' } });
    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.me).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(await bridge.storage.get(AUTH_STORAGE_KEYS.access)).toBeNull();
    expect(await bridge.storage.get(AUTH_STORAGE_KEYS.refresh)).toBeNull();
  });

  it('switchRole меняет me.activeRole и токены', async () => {
    mocks.loginDev.mockResolvedValueOnce(
      ok({ accessToken: 'a1', refreshToken: 'r1', me: me('TEACHER') }),
    );
    mocks.switchRole.mockResolvedValueOnce(
      ok({ accessToken: 'a2', refreshToken: 'r2', me: me('PARENT') }),
    );
    await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);

    await useAuthStore.getState().switchRole('PARENT');

    expect(mocks.switchRole).toHaveBeenCalledWith({ body: { role: 'PARENT' } });
    expect(useAuthStore.getState().me?.activeRole).toBe('PARENT');
    expect(useAuthStore.getState().accessToken).toBe('a2');
    expect(await bridge.storage.get(AUTH_STORAGE_KEYS.refresh)).toBe('r2');
  });

  it('bootstrapAuth: есть refresh → refresh + GET /me → authenticated', async () => {
    memory.set(AUTH_STORAGE_KEYS.refresh, 'r-stored');
    mocks.refresh.mockResolvedValueOnce(ok({ accessToken: 'a-new', refreshToken: 'r-new' }));
    mocks.getMe.mockResolvedValueOnce(ok(me('PARENT')));

    await bootstrapAuth(bridge);

    expect(mocks.refresh).toHaveBeenCalledWith({ body: { refreshToken: 'r-stored' } });
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().me?.activeRole).toBe('PARENT');
  });

  it('bootstrapAuth: без refresh в dev-режиме → anonymous', async () => {
    await bootstrapAuth(bridge);
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
