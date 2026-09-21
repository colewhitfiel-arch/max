# ADR-003. PostgreSQL + Prisma, Redis + BullMQ

**Статус:** accepted, 2026-09-21

## Контекст
Реляционная модель с десятками связей (ученик ↔ группы ↔ занятия ↔ посещаемость ↔ задания). Нужны очереди для ИИ-джобов, пересчётов и напоминаний, а также кэш контекста и ключей идемпотентности.

## Решение
- PostgreSQL 16, `timestamptz`, uuid v7 в качестве PK, jsonb для контента блоков и черновиков.
- Prisma 6 с multi-file schema: `schema/base.prisma` + по файлу на модуль. Миграции — единая линейная цепочка, генерирует только владелец db (сериализованно).
- Redis 7: BullMQ (очереди `analytics`, `ai`, `course-builder`, `notifications`, `schedule`), кэш `StudentContext` (TTL 5 мин), ключи идемпотентности (TTL 24 ч), rate limits.

Drizzle отклонён: Prisma привычнее и даёт единый клиент/типы с меньшим порогом для агентов. Kafka/RabbitMQ — избыточно.

## Последствия
- Параллельные агенты правят разные `.prisma`, но миграции — узкое горлышко по дизайну (см. `10-ownership.md`).
- Read-model'ы (`CourseProgress`, `StudentStatsDaily`) — обычные таблицы, пересчитываемые worker'ом.
