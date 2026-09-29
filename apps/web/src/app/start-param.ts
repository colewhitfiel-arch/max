import { startDemoTour } from '@/features/demo-tour';
import { invitePathFromStartParam } from '@/pages/invite/start-param';
import type { MaxBridge } from '@/shared/max';

/**
 * `https://max.ru/<бот>?startapp=demo` — запуск сразу в демонстрационном режиме (F20): жюри
 * попадает в тур из мессенджера, не ища кнопку, которой у аккаунта с выбранной ролью на пути нет.
 */
export const DEMO_START_PARAM = 'demo';

export function isDemoStartParam(startParam: string | null | undefined): boolean {
  return typeof startParam === 'string' && startParam.trim().toLowerCase() === DEMO_START_PARAM;
}

/** Минимум роутера, который нужен для перехода по диплинку (data router из `router.tsx`). */
export interface StartParamRouter {
  state: { location: { pathname: string } };
  navigate(to: string, options: { replace: boolean }): Promise<void>;
}

/**
 * Дольше вход перехода по диплинку не ждёт: зависшая загрузка чанка экрана (медленная сеть в
 * WebView) не держит сплэш — запуск продолжается, как без диплинка.
 */
export const START_PARAM_WAIT_MS = 8_000;

/** Переход по диплинку этого запуска; null — ещё не применялся. */
let applied: Promise<boolean> | null = null;

/** Экран для полезной нагрузки диплинка; null — неизвестная или пустая. */
export function startParamPath(startParam: string | null | undefined): string | null {
  return invitePathFromStartParam(startParam);
}

/**
 * Диплинк MAX `https://max.ru/<бот>?startapp=<payload>` открывает мини-приложение на его
 * корневом адресе, а `payload` приходит в `bridge.getStartParam()`. Один раз за запуск
 * переводим роутер на экран полезной нагрузки (сейчас — приглашение ребёнка:
 * `invite_<token>` → `/invite/<token>`). Вызывается до входа: экран за `RequireAuth`, и
 * аноним после входа вернётся на него же. Только со стартового корня: перезагрузка
 * внутреннего экрана (`start_param` у WebView прежний) не уводит пользователя обратно.
 *
 * Возвращает промис, который разрешается, когда переход завершён: true — переход сделан,
 * false — диплинка нет, запуск не с корня или переход не завершился за `START_PARAM_WAIT_MS`.
 * Вход (`bootstrapAuth`) начинается только после него: экран приглашения — lazy-маршрут, пока
 * грузится его чанк, роутер стоит на `/`, и редирект с корня (`/auth`, главная роли, онбординг)
 * отменил бы переход. Повторный вызов за запуск (StrictMode) ничего не делает и возвращает тот
 * же промис.
 */
export function applyStartParam(bridge: MaxBridge, router: StartParamRouter): Promise<boolean> {
  applied ??= navigateToStartParam(bridge, router);
  return applied;
}

async function navigateToStartParam(bridge: MaxBridge, router: StartParamRouter) {
  let startParam: string | null;
  try {
    startParam = bridge.getStartParam();
  } catch {
    return false;
  }
  if (router.state.location.pathname !== '/') return false;
  if (isDemoStartParam(startParam)) {
    // Тур сам входит демо-пользователем и открывает экраны — переход роутера не нужен
    startDemoTour();
    return false;
  }
  const path = startParamPath(startParam);
  if (!path) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), START_PARAM_WAIT_MS);
  });
  try {
    return await Promise.race([
      router.navigate(path, { replace: true }).then(() => true),
      timedOut,
    ]);
  } catch {
    /* переход не удался — запуск продолжается с корня */
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/** Сброс «уже применён» — только для тестов. */
export function resetStartParamForTests(): void {
  applied = null;
}
