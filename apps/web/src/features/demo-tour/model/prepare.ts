/**
 * Подготовка шага тура: войти нужным демо-пользователем, открыть экран шага и дождаться
 * подсвечиваемого элемента (он появляется, когда экран загрузил данные).
 */
import { useAuthStore } from '@/shared/auth/store';
import { DEMO_PERSONAS, type DemoPersona, type DemoStep } from './steps';

/** Сколько ждём экран и элемент шага; дальше — карточка без подсветки по центру. */
export const STEP_TIMEOUT_MS = 8_000;
const POLL_MS = 100;
/** Сколько раз повторяем переход, если гард роли увёл на другой экран (смена пользователя). */
const MAX_NAVIGATIONS = 3;

export type Navigate = (path: string, options?: { replace?: boolean }) => unknown;

export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}

export function findTourTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(tourSelector(target));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** В сессии уже этот демо-пользователь в этой роли — или войти им (`POST /auth/dev`). */
export async function ensurePersona(persona: DemoPersona): Promise<void> {
  const { status, me, loginDev } = useAuthStore.getState();
  if (
    status === 'authenticated' &&
    me?.user.id === persona.userId &&
    me.activeRole === persona.role
  )
    return;
  await loginDev(persona.maxUserId, [persona.role]);
}

/**
 * Готовит шаг; `isCancelled` — шаг уже сменили (прекращаем без побочных эффектов).
 * Ошибка входа пробрасывается, отсутствие элемента — нет (шаг покажется без подсветки).
 */
export async function prepareStep(
  step: DemoStep,
  navigate: Navigate,
  isCancelled: () => boolean,
): Promise<void> {
  if (step.persona) await ensurePersona(DEMO_PERSONAS[step.persona]);
  if (isCancelled() || !step.path) return;

  const deadline = Date.now() + STEP_TIMEOUT_MS;
  let navigations = 0;
  while (!isCancelled() && Date.now() < deadline) {
    if (window.location.pathname !== step.path) {
      // После смены пользователя гард роли может перехватить переход — повторяем его.
      if (navigations < MAX_NAVIGATIONS) {
        void navigate(step.path, { replace: navigations > 0 });
        navigations += 1;
      }
    } else if (!step.target || findTourTarget(step.target)) {
      break;
    }
    await sleep(POLL_MS);
  }
  if (isCancelled() || !step.target) return;
  const element = findTourTarget(step.target);
  if (element) revealTarget(element);
}

/**
 * Прокрутить к цели, только если её начало не видно: высокая цель (форма, список), начатая на
 * экране, остаётся на месте — иначе шапка экрана уехала бы. Невидимая — к началу, если она
 * выше половины экрана, иначе по центру.
 */
function revealTarget(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const height = window.innerHeight;
  if (rect.top >= 0 && rect.top < height * 0.6) return;
  element.scrollIntoView({
    block: rect.height > height / 2 ? 'start' : 'center',
    inline: 'nearest',
  });
}
