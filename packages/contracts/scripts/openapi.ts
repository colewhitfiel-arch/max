/**
 * Генерирует OpenAPI 3.0 из ts-rest контрактов: `pnpm --filter @edu/contracts openapi`
 * → `docs/api/openapi.json` в корне монорепо. Стриминговые ручки (SSE, `routes/streaming.ts`)
 * ts-rest не описывает — они перечислены в `docs/05-api-contracts.md` §5.1.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenApi } from '@ts-rest/open-api';
import { API_PREFIX, apiContract } from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const document = generateOpenApi(
  apiContract,
  {
    info: {
      title: 'Мини-приложение дополнительного образования в MAX — API',
      version: '0.1.0',
      description:
        'Собственный API мини-приложения (ученик / родитель / преподаватель). Все ручки, кроме ' +
        '`/health*` и `/auth/*`, требуют `Authorization: Bearer <accessToken>`; роль берётся из ' +
        'токена. Ошибки — `{ error: { code, message, details?, requestId } }`.',
    },
    servers: [
      { url: `https://max-edu.vercel.app${API_PREFIX}`, description: 'Живой стенд' },
      { url: `http://localhost:8080${API_PREFIX}`, description: 'Docker (compose.yaml)' },
      { url: `http://localhost:3000${API_PREFIX}`, description: 'pnpm dev' },
    ],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    security: [{ bearerAuth: [] }],
  },
  { setOperationId: true, jsonQuery: false },
);

const out = path.resolve(__dirname, '../../../docs/api/openapi.json');
mkdirSync(path.dirname(out), { recursive: true });
// Без отступов: схемы zod разворачиваются в каждую ручку, с отступами файл — 3 МБ.
writeFileSync(out, `${JSON.stringify(document)}\n`);
const paths = Object.keys(document.paths ?? {}).length;
console.log(`openapi: ${paths} путей → ${path.relative(process.cwd(), out)}`);
