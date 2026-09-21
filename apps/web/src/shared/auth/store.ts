/**
 * Сессия пользователя (zustand). Токены персистятся через MaxBridge.storage
 * (`auth.access`, `auth.refresh`), профиль `MeDto` — только в памяти (перезапрашивается на старте).
 */
import type { AuthResult, MeDto, Role, TokenPair } from '@edu/contracts';
import { create } from 'zustand';
import { api, call, setApiAuthAdapter } from '../api/client';
import { ApiClientError, apiErrorFromException } from '../api/errors';
import { queryClient } from '../api/query-client';
import { config } from '../config';
import type { MaxBridge, MaxStorage } from '../max/types';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

export const AUTH_STORAGE_KEYS = { access: 'auth.access', refresh: 'auth.refresh' } as const;

export interface AuthState {
  /** idle — до bootstrap; loading — bootstrap идёт; далее authenticated | anonymous. */
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  me: MeDto | null;
  /** Ошибка последнего входа/бутстрапа (для экрана входа в max-режиме). */
  error: ApiClientError | null;

  loginDev(maxUserId: string, roles: Role[]): Promise<MeDto>;
  loginMax(launchParams: string | null): Promise<MeDto>;
  refresh(): Promise<TokenPair>;
  logout(): Promise<void>;
  switchRole(role: Role): Promise<MeDto>;
  addRole(role: Role, inviteCode?: string): Promise<MeDto>;
  /** Обновить профиль после мутаций (PATCH /me/settings, онбординг). */
  updateMe(me: MeDto): void;
  /** Внутреннее: применить новые токены (после refresh в клиенте). */
  setTokens(tokens: TokenPair | null): void;
  /** Внутреннее: сессия невалидна — разлогинить без запроса на сервер. */
  invalidate(): void;
}

let storage: MaxStorage | null = null;

/** Подключить хранилище токенов (обычно `bridge.storage`). */
export function configureAuthStorage(target: MaxStorage | null): void {
  storage = target;
}

async function persistTokens(tokens: TokenPair | null): Promise<void> {
  if (!storage) return;
  try {
    if (tokens) {
      await storage.set(AUTH_STORAGE_KEYS.access, tokens.accessToken);
      await storage.set(AUTH_STORAGE_KEYS.refresh, tokens.refreshToken);
    } else {
      await storage.remove(AUTH_STORAGE_KEYS.access);
      await storage.remove(AUTH_STORAGE_KEYS.refresh);
    }
  } catch (cause) {
    console.warn('[auth] не удалось сохранить токены', cause);
  }
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const applyAuthResult = async (result: AuthResult): Promise<MeDto> => {
    const tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken };
    set({
      status: 'authenticated',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      me: result.me,
      error: null,
    });
    await persistTokens(tokens);
    return result.me;
  };

  const clearSession = async (): Promise<void> => {
    set({ status: 'anonymous', accessToken: null, refreshToken: null, me: null });
    queryClient.clear();
    await persistTokens(null);
  };

  return {
    status: 'idle',
    accessToken: null,
    refreshToken: null,
    me: null,
    error: null,

    async loginDev(maxUserId, roles) {
      try {
        const result = await call(api.auth.loginDev({ body: { maxUserId, roles } }));
        queryClient.clear();
        return await applyAuthResult(result);
      } catch (cause) {
        const error = apiErrorFromException(cause);
        set({ error });
        throw error;
      }
    },

    async loginMax(launchParams) {
      if (!launchParams) {
        const error = new ApiClientError({
          code: 'UNAUTHORIZED',
          message: 'Нет launch-параметров MAX: открой приложение из мессенджера',
          status: 0,
        });
        set({ status: 'anonymous', error });
        throw error;
      }
      try {
        const result = await call(api.auth.loginMax({ body: { launchParams } }));
        queryClient.clear();
        return await applyAuthResult(result);
      } catch (cause) {
        const error = apiErrorFromException(cause);
        set({ status: 'anonymous', error });
        throw error;
      }
    },

    async refresh() {
      const refreshToken = get().refreshToken;
      if (!refreshToken) {
        throw new ApiClientError({
          code: 'UNAUTHORIZED',
          message: 'Нет refresh-токена',
          status: 0,
        });
      }
      const tokens = await call(api.auth.refresh({ body: { refreshToken } }));
      set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      await persistTokens(tokens);
      return tokens;
    },

    async logout() {
      const refreshToken = get().refreshToken;
      if (refreshToken) {
        try {
          await api.auth.logout({ body: { refreshToken } });
        } catch {
          /* сервер недоступен — локально всё равно выходим */
        }
      }
      await clearSession();
    },

    async switchRole(role) {
      const result = await call(api.auth.switchRole({ body: { role } }));
      queryClient.clear();
      return applyAuthResult(result);
    },

    async addRole(role, inviteCode) {
      const result = await call(
        api.auth.addRole({ body: inviteCode ? { role, inviteCode } : { role } }),
      );
      queryClient.clear();
      return applyAuthResult(result);
    },

    updateMe(me) {
      set({ me });
    },

    setTokens(tokens) {
      set({ accessToken: tokens?.accessToken ?? null, refreshToken: tokens?.refreshToken ?? null });
      void persistTokens(tokens);
    },

    invalidate() {
      void clearSession();
    },
  };
});

// Клиент API читает токены из store и сообщает об их обновлении/протухании.
setApiAuthAdapter({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (tokens) => useAuthStore.getState().setTokens(tokens),
  onUnauthorized: () => useAuthStore.getState().invalidate(),
});

/**
 * Старт приложения: есть refresh-токен → обновить пару и загрузить `GET /me`;
 * нет и `VITE_AUTH_MODE=max` → вход по launch-параметрам; иначе — anonymous.
 */
export async function bootstrapAuth(bridge: MaxBridge): Promise<void> {
  const store = useAuthStore.getState();
  if (store.status !== 'idle') return;
  configureAuthStorage(bridge.storage);
  useAuthStore.setState({ status: 'loading', error: null });

  let refreshToken: string | null = null;
  let accessToken: string | null = null;
  try {
    refreshToken = await bridge.storage.get(AUTH_STORAGE_KEYS.refresh);
    accessToken = await bridge.storage.get(AUTH_STORAGE_KEYS.access);
  } catch {
    /* хранилище недоступно — считаем, что сессии нет */
  }

  if (refreshToken) {
    useAuthStore.setState({ accessToken, refreshToken });
    try {
      await useAuthStore.getState().refresh();
      const me = await call(api.auth.getMe());
      useAuthStore.setState({ status: 'authenticated', me, error: null });
      return;
    } catch (cause) {
      await persistTokens(null);
      useAuthStore.setState({
        status: 'anonymous',
        accessToken: null,
        refreshToken: null,
        me: null,
        error: apiErrorFromException(cause),
      });
      if (config.authMode !== 'max') return;
    }
  }

  if (config.authMode === 'max') {
    let launchParams: string | null = null;
    try {
      launchParams = bridge.getLaunchParams();
    } catch {
      launchParams = null;
    }
    try {
      await useAuthStore.getState().loginMax(launchParams);
    } catch {
      /* ошибка уже в store.error; экран входа покажет её */
    }
    return;
  }

  useAuthStore.setState({ status: 'anonymous' });
}

/** Сброс для тестов. */
export function resetAuthStore(): void {
  useAuthStore.setState({
    status: 'idle',
    accessToken: null,
    refreshToken: null,
    me: null,
    error: null,
  });
}
