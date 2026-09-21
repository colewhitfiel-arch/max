# Правила для агентов этого репозитория

Проект: мини-приложение дополнительного образования в мессенджере MAX (ученик / родитель / преподаватель), ИИ — GigaChat. Монорепо TypeScript (pnpm + Turborepo). Foundation готов, продуктовые модули делаются по workstream'ам.

1. **Перед работой прочитай** `docs/AGENT_GUIDE.md` (как устроено и куда что класть), затем `docs/FOUNDATION.md` и свой workstream в `docs/12-workstreams.md`. `docs/` — source of truth: код подстраивается под документы; расхождение — сначала правка документа через владельца.
2. **Не редактируй чужие зоны** (`docs/10-ownership.md`, `OWNERS.yaml`, AGENT_GUIDE §18). Нужна правка в роутере, `app.module`/`modules/index.ts`, контрактах ядра, миграциях, `packages/ui` — запрос владельцу.
3. **Контракты API — только `packages/contracts`.** Никаких DTO в приложениях. После правки — `pnpm build` пакета.
4. **Backend-модуль читает только свои таблицы;** чужое — через публичный сервис или доменные события. Ошибки — `Errors.*`, не `HttpException`.
5. **Формулы аналитики — только в `modules/analytics`.**
6. **Модель данных — сначала `docs/04`, потом `.prisma`;** миграции генерирует владелец db, сериализованно.
7. **Frontend:** только `@edu/ui` для визуала (никаких стилей в фичах), данные через `entities/*/api.ts` поверх `shared/api/client.ts`, роуты фичи в её `routes.tsx`, тексты через i18n, состояния loading/error/empty обязательны.
8. **Внешние системы — только за портами** (`AuthProvider`, `AiService`, `StorageProvider`, `JobQueue`, `KeyValueStore`, `PaymentProvider`); в тестах — mock/fake.
9. **Секреты только через env;** в логи не попадают токены, ключи, тексты сообщений ИИ.
10. **Перед завершением:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, `pnpm format`, `pnpm ownership:check`; приложение стартует.
11. **Язык:** документация и UI-тексты — русский; идентификаторы, коммиты (Conventional Commits), ветки `feat/<workstream>-<slug>` — английский.
12. **Новое архитектурное решение** — ADR в `docs/adr/` через владельца docs; старые ADR не правятся, а заменяются.
13. **Windows:** Bash-тул режет команды длиннее ~8 КБ — большие файлы пиши через Write, не heredoc. Локальная БД — `pnpm db:up` (без Docker).
