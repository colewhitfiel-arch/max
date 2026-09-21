# ADR-013. Формат ответов API и единый клиент (уточняет ADR-004)

**Статус:** accepted, 2026-09-21

## Контекст
Нужен один формат ответов, который фронт обрабатывает централизованно, и один API-клиент для всех фич. `@ts-rest/react-query` не заявляет поддержку React 19, а стриминговые ручки (SSE) ts-rest не типизирует.

## Решение
1. **Формат ответа.** Успех — HTTP 2xx и DTO из контракта без обёртки. Ошибка — HTTP 4xx/5xx и тело `{ error: { code, message, details?, requestId? } }` (`ApiErrorSchema`). Коды: `VALIDATION, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, BUSINESS_RULE, RATE_LIMITED, NOT_IMPLEMENTED, EXTERNAL_INTEGRATION, INTERNAL`. Заголовок `X-Request-Id` — во всех ответах; клиент может прислать свой. Обёртка `{ success, data }` не используется: HTTP-статус уже является дискриминатором, а ts-rest типизирует тело по статусу.
2. **Сервер.** `@ts-rest/nest` реализует контракт; валидация входа — схемами контракта; ошибки валидации и все исключения приводятся к формату выше единым `ApiExceptionFilter`.
3. **Клиент.** `@ts-rest/core` `initClient(apiContract)` с кастомным `fetch`-адаптером в `apps/web/src/shared/api/client.ts`: подставляет `Authorization`, `X-Request-Id`, обновляет access-токен по 401 через refresh, нормализует любую ошибку в `ApiClientError { code, message, details, status, requestId }`. Хуки TanStack Query пишутся в `entities/<x>/api.ts` поверх этого клиента. Никаких прямых `fetch` в фичах.
4. **SSE.** Стриминговые ручки описаны в `contracts/routes/streaming.ts` (пути + схемы тел + `AiStreamEventSchema`), на сервере — обычные контроллеры с `ZodValidationPipe`, на клиенте — `shared/api/sse.ts`.

## Последствия
- Фичи не знают о транспорте и формате ошибок; получают типизированные данные или `ApiClientError`.
- Добавление ручки = запись в контракт + реализация в модуле; клиент и типы появляются автоматически.
