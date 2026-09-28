import { invitePathFromStartParam } from '@/pages/invite/start-param';
import type { MaxBridge } from '@/shared/max';

/** Минимум роутера, который нужен для перехода по диплинку (data router из `router.tsx`). */
export interface StartParamRouter {
  state: { location: { pathname: string } };
  navigate(to: string, options: { replace: boolean }): unknown;
}

let applied = false;

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
 * Возвращает true, если переход сделан.
 */
export function applyStartParam(bridge: MaxBridge, router: StartParamRouter): boolean {
  if (applied) return false;
  applied = true;
  let startParam: string | null;
  try {
    startParam = bridge.getStartParam();
  } catch {
    return false;
  }
  const path = startParamPath(startParam);
  if (!path || router.state.location.pathname !== '/') return false;
  void router.navigate(path, { replace: true });
  return true;
}

/** Сброс «уже применён» — только для тестов. */
export function resetStartParamForTests(): void {
  applied = false;
}
