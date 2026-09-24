import type { AiLogger } from '../../logger';
import type { GigaChatHttp } from './http';
import { OAuthResponseSchema } from './schemas';

export interface TokenManagerConfig {
  authKey: string;
  scope: string;
  oauthUrl: string;
  timeoutMs: number;
  /** За сколько до истечения обновлять токен. */
  refreshSkewMs: number;
  now: () => number;
  uuid: () => string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * OAuth GigaChat: `POST {oauthUrl}` с `Authorization: Basic {authKey}`, `RqUID`, `scope=...`.
 * Токен кэшируется и обновляется за `refreshSkewMs` до истечения; параллельные запросы
 * ждут одно и то же обновление. `invalidate(token)` — при 401 от API.
 */
export class GigaChatTokenManager {
  private token?: CachedToken;
  private pending?: Promise<string>;

  constructor(
    private readonly http: GigaChatHttp,
    private readonly config: TokenManagerConfig,
    private readonly logger: AiLogger,
  ) {}

  async getToken(): Promise<string> {
    const now = this.config.now();
    if (this.token && this.token.expiresAt - this.config.refreshSkewMs > now) {
      return this.token.value;
    }
    if (!this.pending) {
      this.pending = this.refresh().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  /**
   * Сбрасывает кэш после 401. С `staleToken` сбрасывает, только если в кэше всё ещё этот токен:
   * параллельные 401 со старым токеном не выбрасывают уже полученный свежий и не запускают второй OAuth.
   */
  invalidate(staleToken?: string): void {
    if (staleToken !== undefined && this.token?.value !== staleToken) return;
    this.token = undefined;
  }

  /** Есть ли валидный (с учётом skew) токен в кэше. */
  get hasFreshToken(): boolean {
    return (
      this.token !== undefined &&
      this.token.expiresAt - this.config.refreshSkewMs > this.config.now()
    );
  }

  private async refresh(): Promise<string> {
    const started = this.config.now();
    // Внешний signal сюда намеренно не передаётся: обновление общее для всех запросов.
    const data = await this.http.requestJson(
      {
        url: this.config.oauthUrl,
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.config.authKey}`,
          RqUID: this.config.uuid(),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: `scope=${encodeURIComponent(this.config.scope)}`,
        timeoutMs: this.config.timeoutMs,
        op: 'oauth',
      },
      OAuthResponseSchema,
    );
    const expiresAt = normalizeExpiresAt(data.expires_at);
    this.token = { value: data.access_token, expiresAt };
    this.logger.info('gigachat.oauth.refreshed', {
      durationMs: this.config.now() - started,
      expiresInMs: expiresAt - this.config.now(),
    });
    return data.access_token;
  }
}

/** Документация обещает миллисекунды; на случай секунд (< 1e12) — домножаем. */
export function normalizeExpiresAt(value: number): number {
  return value < 1e12 ? value * 1000 : value;
}
