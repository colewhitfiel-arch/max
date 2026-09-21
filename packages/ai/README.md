# @edu/ai

Слой ИИ для монорепо: порт `AiProvider` (`LlmProvider` в docs), адаптер GigaChat, детерминированный
mock, реестр промптов, разбор JSON-ответов и сериализация `StudentContext`. Используется в `apps/api`
(HTTP и worker). Не знает о Prisma, контрактах и домене — только о модели.

**Главное правило:** feature-модули не ходят в GigaChat напрямую. Они получают `AiService`
(или `AiProvider`) через DI и работают с типами из этого пакета. Замена провайдера/модели — правка
адаптера и конфига, не фич (ADR-007).

## Структура

```
src/
  types.ts                 AiChatRequest/Response, AiStreamChunk, AiEmbed*, AiProviderError
  provider.ts              interface AiProvider { chat, stream, embed } (+ alias LlmProvider)
  service.ts               AiService — обёртка для модулей api: requestId, дефолты, длительность, логи
  config.ts                AiConfig, createAiProvider(), aiConfigFromEnv()
  logger.ts                AiLogger, noop/console, describeRequest/Response/Error (безопасная мета)
  retry.ts / timeout.ts    withRetry (backoff + джиттер), withTimeout (AbortSignal)
  json.ts                  extractJson, parseJsonResponse, chatJson (ретраи с текстом ошибки)
  prompts/registry.ts      definePrompt, buildMessages, buildRequest, PromptRegistry
  prompts/examples/echo.ts единственный пример; продуктовые промпты — prompts/<feature>.ts
  context/student-context.ts  StudentContext + serializeStudentContext (≤ 6000 символов)
  providers/mock.ts        MockAiProvider (= FakeLlmProvider)
  providers/gigachat/      GigaChatProvider: OAuth, chat, SSE-стрим, embeddings, маппинг ошибок
```

## Как получить провайдера

```ts
import { aiConfigFromEnv, createAiService } from '@edu/ai';

// AI_PROVIDER=mock | gigachat, GIGACHAT_* — см. .env.example
const ai = createAiService(aiConfigFromEnv(process.env), { logger, defaultModel: 'GigaChat' });

const res = await ai.chat({
  messages: [{ role: 'user', content: 'Привет' }],
  metadata: { promptId: 'tutor.system@1', userId },
});

for await (const chunk of ai.stream({ messages })) {
  if (chunk.type === 'token') send(chunk.text);
  else if (chunk.type === 'done') finish(chunk.response);
  else fail(chunk.error); // AiProviderError
}
```

`AiService` сам реализует `AiProvider`, поэтому его можно передавать туда, где ждут провайдера.
В тестах модулей — `new MockAiProvider({ responses: [...] })` и ассерты по `provider.calls`.

Ошибки: `chat`/`embed` отклоняются `AiProviderError` с `code`
(`TIMEOUT | RATE_LIMITED | AUTH | INVALID_RESPONSE | NETWORK | UNAVAILABLE | UNKNOWN`) и `retryable`.
Отмена через `signal` пробрасывается исходной причиной (`AbortError`). `stream` не бросает: ошибка
приходит чанком `{ type: 'error' }`; при отмене вызывающим итерация просто завершается.

## Как писать промпты

Промпт — код с версией и (для структурированных ответов) zod-схемой. Ключ `id@version` пишется в
`metadata.promptId` и в результаты генерации; изменил текст, влияющий на результат, — подними версию.

```ts
import { z } from 'zod';
import { buildRequest, definePrompt, PromptRegistry } from '@edu/ai';

export const ProfileSchema = z.object({ interests: z.array(z.string()), goals: z.array(z.string()) });

export const profileExtractPrompt = definePrompt({
  id: 'onboarding.profile-extract',
  version: 1,
  description: 'Извлекает интересы и цели из диалога онбординга',
  system: 'Ты — ассистент... Отвечай только JSON.',
  user: (vars: { dialog: string }) => vars.dialog, // тип переменных выводится из аннотации
  schema: ProfileSchema,
  temperature: 0,
});

const registry = new PromptRegistry().registerAll([profileExtractPrompt]);

const { data } = await ai.chatJson(
  buildRequest(profileExtractPrompt, { dialog }, { metadata: { userId } }),
  profileExtractPrompt.schema,
);
```

`chatJson` вырезает JSON из ответа (```json-блоки, первый `{…}`/`[…]`), валидирует схемой и при
ошибке до 2 раз переспрашивает модель, добавляя текст ошибки валидации (ADR-007). Модель получает не
сырые таблицы, а `serializeStudentContext(ctx)` — компактный текст секциями, урезаемый по лимиту.

## Логирование и безопасность

- В логи не попадают ключи, токены и содержимое сообщений — только размеры (символы/токены),
  `promptId`, `requestId`, `userId`, модель, длительность, код ошибки. Собирай мету через
  `describeRequest` / `describeResponse` / `describeError`, не вручную.
- `AiProviderError.message` не содержит текста запросов; из тела ошибки API берётся только поле
  `message` (до 200 символов).
- `raw` в `AiChatResponse` — для отладки, в логи не пишется.
- PII-минимизация (имя/ник без фамилий и контактов) — обязанность сборщика `StudentContext`
  в `modules/ai`; сериализатор ничего не фильтрует.
- Ключ GigaChat — только из env (`GIGACHAT_AUTH_KEY`); сертификат НУЦ Минцифры — `GIGACHAT_CA_CERT_PATH`.

## Что mock, что реальное

| Возможность | `MockAiProvider` | `GigaChatProvider` |
|---|---|---|
| `chat` | правила `match` → ответ, иначе эхо `[mock] …` (`{}` для json) | `POST /chat/completions` |
| `stream` | режет ответ по словам | SSE `data: {...}` … `data: [DONE]`, idle-таймаут |
| `embed` | детерминированный вектор (8 измерений) из хеша | `POST /embeddings` |
| OAuth | — | `POST oauthUrl`, Basic + RqUID, кэш токена, обновление за 60 с, сброс при 401 |
| Ретраи/таймауты | нет (есть `delayMs`, `failWith`) | `withRetry` + `withTimeout`, `Retry-After` |
| Сеть в тестах | нет | нет — `fetch` инжектируется |

Реальный API в тестах пакета не вызывается. Smoke на живом API — отдельным скриптом за флагом
(задача F8), после проверки допущений по документации GigaChat: формат `expires_at` (мс), поля
`usage` в стрим-чанках, структура ответа `/embeddings`, поддержка `response_format`
(сейчас провайдер его не отправляет — просить JSON нужно в промпте).
