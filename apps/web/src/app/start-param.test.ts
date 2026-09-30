/** Диплинк MAX `startapp=invite_<token>` при запуске ведёт на экран приглашения (F14). */
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MaxBridge } from '@/shared/max';
import { resetDemoTour, useDemoTourStore } from '@/features/demo-tour/model/store';
import {
  applyStartParam,
  isDemoStartParam,
  resetStartParamForTests,
  START_PARAM_WAIT_MS,
  startParamPath,
} from './start-param';

const TOKEN = 'Abc_DEF-0123456789abcdefghijklmn';

function bridgeWith(startParam: string | null): MaxBridge {
  return { getStartParam: () => startParam } as unknown as MaxBridge;
}

function routerAt(path: string) {
  return createMemoryRouter(
    [
      { path: '/', element: null },
      {
        path: '/invite/:token',
        // Как в приложении: экран приглашения — lazy-маршрут, его чанк грузится не сразу.
        lazy: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { element: null };
        },
      },
      { path: '/student/tutor', element: null },
    ],
    { initialEntries: [path] },
  );
}

afterEach(() => resetStartParamForTests());

describe('startParamPath', () => {
  it('приглашение → /invite/<token>; прочее и битые токены — null', () => {
    expect(startParamPath(`invite_${TOKEN}`)).toBe(`/invite/${TOKEN}`);
    expect(startParamPath('club-42')).toBeNull();
    expect(startParamPath('invite_')).toBeNull();
    expect(startParamPath('invite_short')).toBeNull();
    expect(startParamPath('invite_../../etc/passwd0000')).toBeNull();
    expect(startParamPath(null)).toBeNull();
  });

  it('QR занятия, снятый камерой телефона: checkin_<код> → /check-in/<код>', () => {
    expect(startParamPath(`checkin_${TOKEN}`)).toBe(`/check-in/${TOKEN}`);
    expect(startParamPath('checkin_short')).toBeNull();
    expect(startParamPath('checkin_')).toBeNull();
  });
});

describe('applyStartParam', () => {
  it('запуск на корне с приглашением — переход на экран приглашения, один раз', async () => {
    const router = routerAt('/');
    const started = applyStartParam(bridgeWith(`invite_${TOKEN}`), router);
    // Пока грузится lazy-экран, роутер ещё на корне.
    expect(router.state.location.pathname).toBe('/');
    expect(await started).toBe(true);
    // Промис разрешается, когда переход завершён: вход, начатый после него, переход не отменит.
    expect(router.state.location.pathname).toBe(`/invite/${TOKEN}`);
    expect(router.state.navigation.state).toBe('idle');

    // Возврат на корень после принятия (или StrictMode-повтор эффекта) не уводит обратно:
    // повторный вызов отдаёт тот же промис и не переходит снова.
    await router.navigate('/');
    expect(applyStartParam(bridgeWith(`invite_${TOKEN}`), router)).toBe(started);
    await started;
    expect(router.state.location.pathname).toBe('/');
  });

  it('перезагрузка внутреннего экрана с тем же start_param — остаёмся на месте', async () => {
    const router = routerAt('/student/tutor');
    expect(await applyStartParam(bridgeWith(`invite_${TOKEN}`), router)).toBe(false);
    expect(router.state.location.pathname).toBe('/student/tutor');
  });

  it('без start_param или с чужим — ничего не делает', async () => {
    const router = routerAt('/');
    expect(await applyStartParam(bridgeWith(null), router)).toBe(false);
    resetStartParamForTests();
    expect(await applyStartParam(bridgeWith('club-42'), router)).toBe(false);
    expect(router.state.location.pathname).toBe('/');
  });

  it('чанк экрана завис — вход ждёт перехода не дольше START_PARAM_WAIT_MS', async () => {
    vi.useFakeTimers();
    try {
      const router = createMemoryRouter(
        [
          { path: '/', element: null },
          // Загрузка lazy-экрана не завершается (сеть в WebView «повисла»).
          { path: '/invite/:token', lazy: () => new Promise<never>(() => {}) },
        ],
        { initialEntries: ['/'] },
      );
      let settled = false;
      const started = applyStartParam(bridgeWith(`invite_${TOKEN}`), router).then((done) => {
        settled = true;
        return done;
      });
      await vi.advanceTimersByTimeAsync(START_PARAM_WAIT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await started).toBe(false);
      expect(router.state.location.pathname).toBe('/');
    } finally {
      vi.useRealTimers();
    }
  });

  it('SDK бросил исключение — запуск продолжается как обычно', async () => {
    const bridge = {
      getStartParam: () => {
        throw new Error('sdk');
      },
    } as unknown as MaxBridge;
    expect(await applyStartParam(bridge, routerAt('/'))).toBe(false);
  });
});

describe('startapp=demo (F20)', () => {
  afterEach(() => resetDemoTour());

  it('распознаёт demo без учёта регистра и пробелов, прочее — нет', () => {
    expect(isDemoStartParam('demo')).toBe(true);
    expect(isDemoStartParam(' Demo ')).toBe(true);
    expect(isDemoStartParam('demo_1')).toBe(false);
    expect(isDemoStartParam(null)).toBe(false);
  });

  it('запуск на корне с demo — стартует тур с первого шага, роутер не переводит', async () => {
    const router = routerAt('/');
    expect(await applyStartParam(bridgeWith('demo'), router)).toBe(false);
    expect(useDemoTourStore.getState().active).toBe(true);
    expect(useDemoTourStore.getState().index).toBe(0);
    expect(router.state.location.pathname).toBe('/');
  });

  it('demo не с корня (перезагрузка внутреннего экрана) — тур не стартует', async () => {
    expect(await applyStartParam(bridgeWith('demo'), routerAt('/student/tutor'))).toBe(false);
    expect(useDemoTourStore.getState().active).toBe(false);
  });
});
