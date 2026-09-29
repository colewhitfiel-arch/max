import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { healthContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { Public } from '../../common/auth/decorators';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RateLimit } from '../../common/rate-limit/rate-limit';

const APP_VERSION = process.env.npm_package_version ?? '0.1.0';
const MAX_TEXT = 2_000;

/** Тело `POST /client-errors`: строки обрезаются, лишнее отбрасывается — это телеметрия, не API. */
function pick(body: unknown, key: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' && value ? value.slice(0, MAX_TEXT) : undefined;
}

/** Служебные ручки. Проверяют полный путь api → БД. */
@Controller()
@Public()
export class HealthController {
  private readonly log;

  constructor(
    private readonly prisma: PrismaService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'client-errors' });
  }

  @TsRestHandler(healthContract)
  handler() {
    return tsRestHandler(healthContract, {
      getHealth: async () => ({
        status: 200,
        body: {
          status: 'ok' as const,
          db: (await this.prisma.ping()) ? ('ok' as const) : ('down' as const),
          version: APP_VERSION,
          time: new Date().toISOString(),
        },
      }),
      getLiveness: async () => ({ status: 200, body: { status: 'ok' as const } }),
    });
  }

  /**
   * Необработанные ошибки клиента (`apps/web/src/app/client-errors.ts`) — в логи стенда уровнем
   * warn: в WebView MAX консоли нет, и «чёрный экран» иначе не диагностировать. Вне контракта
   * (как `files/local`): это телеметрия, а не API продукта. Лимит — как у входа, с одного IP.
   */
  @Post('client-errors')
  @HttpCode(204)
  @RateLimit('auth')
  logClientError(@Body() body: unknown): void {
    this.log.warn(
      {
        kind: pick(body, 'kind'),
        message: pick(body, 'message'),
        stack: pick(body, 'stack'),
        url: pick(body, 'url'),
        at: pick(body, 'at'),
      },
      'ошибка на клиенте',
    );
  }
}
