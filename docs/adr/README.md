# ADR — Architecture Decision Records

Формат: Контекст → Решение → Последствия → Статус. Нумерация сквозная, новые ADR — через владельца docs. Пересмотр решения = новый ADR со ссылкой на старый, а не правка старого.

| # | Решение | Статус |
|---|---|---|
| [ADR-001](ADR-001-typescript-monorepo.md) | TypeScript-монорепо на pnpm + Turborepo | accepted |
| [ADR-002](ADR-002-modular-monolith.md) | Модульный монолит NestJS + отдельный worker-процесс | accepted |
| [ADR-003](ADR-003-postgres-prisma-redis-bullmq.md) | PostgreSQL + Prisma, Redis + BullMQ | accepted |
| [ADR-004](ADR-004-contract-first-api.md) | Contract-first API: zod + ts-rest в `packages/contracts` | accepted |
| [ADR-005](ADR-005-frontend-stack.md) | React SPA, FSD-lite, TanStack Query, MSW для параллельной разработки | accepted, уточнён ADR-011 |
| [ADR-006](ADR-006-auth-max-jwt.md) | Аутентификация через MAX launch-параметры → собственный JWT | accepted |
| [ADR-007](ADR-007-llm-port-and-insight-cache.md) | LLM за портом, промпты в репо, инсайты через кэш worker'ом | accepted |
| [ADR-008](ADR-008-analytics-events-and-daily-stats.md) | Аналитика: события + дневные агрегаты, формулы в одном модуле | accepted |
| [ADR-009](ADR-009-payment-provider-port.md) | Платежи за портом `PaymentProvider` | accepted |
| [ADR-010](ADR-010-course-per-group-and-block-assignments.md) | Курс привязан к группе; задания из блоков создаются при публикации | accepted |
| [ADR-011](ADR-011-plain-css-ui-layer.md) | UI-слой на обычном CSS с токенами вместо Tailwind | accepted |
| [ADR-012](ADR-012-dev-without-docker.md) | Dev без Docker: embedded PostgreSQL, inline-очередь, локальное хранилище | accepted |
| [ADR-013](ADR-013-api-client-and-response-format.md) | Формат ответов API и единый клиент | accepted |
