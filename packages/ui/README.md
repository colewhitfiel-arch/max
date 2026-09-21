# @edu/ui

Дизайн-система мини-приложения (mobile-first, WebView MAX): токены, тема, базовые компоненты, иконки-заглушки и демо-страница.

## Принцип: заменяемый визуальный слой

Текущий визуал — **временный**. Финальный UI/UX делается позже и заменяется **внутри этого пакета**, не трогая потребителей:

- Только обычный CSS: `src/styles/tokens.css` (CSS custom properties) + один `.css` на компонент. Без Tailwind и CSS-in-JS.
- Классы с префиксом `ui-` (BEM-lite: `ui-button`, `ui-button__icon`). Варианты и состояния — через data-атрибуты (`data-variant`, `data-size`, `data-state`) и `aria-*`, а не через модификаторы классов.
- Компоненты не знают о домене: никаких типов из `@edu/contracts`, запросов и бизнес-логики. Только props, состояния, поведение и a11y.
- Публичный API (пропсы) стабилен и задокументирован JSDoc. Менять после foundation — только по координации с потребителями.

Пакет отдаётся исходниками (`main: src/index.ts`), сборки нет — Vite потребителя обрабатывает `.tsx` и `.css`.

## Подключение

```ts
import { Button, ToastProvider, applyTheme } from '@edu/ui';
// стили (токены + reset) импортируются один раз вместе с '@edu/ui'
```

Демо всех компонентов: `import { UiPlayground } from '@edu/ui/playground'` — монтируется web-приложением на dev-роуте.

## Тема и токены

- `applyTheme('light' | 'dark' | 'system')` ставит `data-theme` на `<html>`. Без атрибута или при `system` работает `prefers-color-scheme`.
- Цвета, типографика, отступы (сетка 4px), радиусы, тени, z-index, длительности — в `src/styles/tokens.css`. Тёмная тема переопределяет только цвета и тени.
- То, что нужно в JS (брейкпоинты, z-index, длительности), продублировано в `src/tokens.ts` — менять синхронно с CSS.

Чтобы поменять внешний вид: правь значения токенов и CSS компонентов. Разметка и пропсы остаются.

## Как добавить компонент

1. `src/components/<Name>/<Name>.tsx` + `<Name>.css` + `index.ts`.
2. Компонент принимает `className` и `...rest` своего HTML-элемента; `forwardRef` для форм/кнопок/инпутов.
3. Классы `ui-<name>`, `ui-<name>__<part>`; варианты — `data-*`. CSS импортируется в самом `.tsx`.
4. Пропсы — с JSDoc на русском. Экспорт из `src/index.ts`.
5. Показать все варианты в `src/playground/index.tsx`. Тесты — только поведение/a11y (Testing Library + user-event).

Новые компоненты в пакет добавляет владелец ui (см. `docs/10-ownership.md` §10.6); до этого компонент живёт в `apps/web/src/shared/ui/`.

## Проверки

```
pnpm typecheck && pnpm lint && pnpm test
```

## Из макета Figma (главный экран ученика)

- Токены: тёмная тема первична (`#0d0d0d` / `#1e1e1e`, primary `#0264ce`, info `#1858fa`), шрифт Montserrat (`@fontsource-variable/montserrat`, подключается в `src/index.ts`), радиус карточек 20px; `--ui-color-bg-glow` — синее свечение фона в `AppLayout`.
- `BottomNavigation` — «пилюля» с иконками (подписи скрыты визуально), `prominent` — акцентный круглый пункт.
- `WeekArc` — дуга дней недели с плашками по тонам и легендой; `CardColumns` — карточки-колонки с выровненными строками (subgrid); `VisuallyHidden`; `Text variant="small"` (14px); `BellIcon count` — колокольчик со счётчиком.
- Заливочные иконки (`HomeIcon`, `AiIcon`, `BookIcon`, `SettingsIcon`, `UserIcon`, `BellIcon`, `CalendarClockIcon`, `FireIcon`, `GemIcon`) — геометрия из Figma, цвет `currentColor`.

## Что временно

- Светлая палитра — зеркало тёмной, в макете её нет.
- Контурные иконки (`ChatIcon`, `UsersIcon`, `CalendarIcon`, `PlusIcon`, …) — заглушки до финального набора.
- Анимации оверлеев — только вход, без анимации выхода.
- Компоненты второй волны из `docs/06-shared.md` (чат, файлы, графики, `WeekStrip`, `PeriodPicker`) не включены.
