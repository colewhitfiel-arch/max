# ADR-006. Аутентификация через MAX launch-параметры → собственный JWT

**Статус:** accepted, 2026-09-21 (детали MAX Bridge — уточнить в I2)

## Контекст
Приложение живёт внутри MAX; у пользователя нет отдельного логина. Точный API launch-параметров MAX на момент проектирования не сверен с документацией (dev.max.ru). Один пользователь может иметь несколько ролей (преподаватель и родитель одновременно).

## Решение
- `POST /auth/max { launchParams }` → `MaxAuthProvider.verify()` проверяет подпись/срок и возвращает `maxUserId`, имя, аватар. Реализация за интерфейсом `AuthProvider`; в dev — `DevAuthProvider` (`POST /auth/dev`).
- Сервер выдаёт собственные токены: access JWT 15 мин (`userId`, `roles[]`, `activeRole`, `profileId`), refresh 30 дней (хэш в `RefreshToken`).
- Роли — `UserRole[]`; активная роль — в JWT. Смена роли = новый токен (`/auth/switch-role`). Добавление роли — `/auth/roles` (STUDENT/PARENT свободно, TEACHER по `School.inviteCode`).
- Ресурсный доступ — policies в модулях, не в guard'ах.

## Последствия
- Вся система не зависит от механики MAX; замена адаптера не трогает модули.
- До подтверждения API MAX все фазы идут на `DevAuthProvider`.
- Токены хранятся в памяти + MAX storage (через bridge); при перезапуске — refresh.
