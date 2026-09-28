/** Диплинк MAX `startapp=invite_<token>` при запуске ведёт на экран приглашения (F14). */
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { MaxBridge } from '@/shared/max';
import { applyStartParam, resetStartParamForTests, startParamPath } from './start-param';

const TOKEN = 'Abc_DEF-0123456789abcdefghijklmn';

function bridgeWith(startParam: string | null): MaxBridge {
  return { getStartParam: () => startParam } as unknown as MaxBridge;
}

function routerAt(path: string) {
  return createMemoryRouter(
    [
      { path: '/', element: null },
      { path: '/invite/:token', element: null },
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
});

describe('applyStartParam', () => {
  it('запуск на корне с приглашением — переход на экран приглашения, один раз', async () => {
    const router = routerAt('/');
    expect(applyStartParam(bridgeWith(`invite_${TOKEN}`), router)).toBe(true);
    await Promise.resolve();
    expect(router.state.location.pathname).toBe(`/invite/${TOKEN}`);

    // Возврат на корень после принятия (или StrictMode-повтор эффекта) не уводит обратно.
    await router.navigate('/');
    expect(applyStartParam(bridgeWith(`invite_${TOKEN}`), router)).toBe(false);
    expect(router.state.location.pathname).toBe('/');
  });

  it('перезагрузка внутреннего экрана с тем же start_param — остаёмся на месте', () => {
    const router = routerAt('/student/tutor');
    expect(applyStartParam(bridgeWith(`invite_${TOKEN}`), router)).toBe(false);
    expect(router.state.location.pathname).toBe('/student/tutor');
  });

  it('без start_param или с чужим — ничего не делает', () => {
    const router = routerAt('/');
    expect(applyStartParam(bridgeWith(null), router)).toBe(false);
    resetStartParamForTests();
    expect(applyStartParam(bridgeWith('club-42'), router)).toBe(false);
    expect(router.state.location.pathname).toBe('/');
  });

  it('SDK бросил исключение — запуск продолжается как обычно', () => {
    const bridge = {
      getStartParam: () => {
        throw new Error('sdk');
      },
    } as unknown as MaxBridge;
    expect(applyStartParam(bridge, routerAt('/'))).toBe(false);
  });
});
