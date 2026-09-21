import { Controller } from '@nestjs/common';
import { healthContract } from '@edu/contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

const APP_VERSION = process.env.npm_package_version ?? '0.1.0';

/** Служебные ручки. Проверяют полный путь api → БД. */
@Controller()
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
}
