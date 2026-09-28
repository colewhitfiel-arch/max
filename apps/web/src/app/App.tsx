import { applyAccent } from '@edu/ui';
import { useEffect, useLayoutEffect } from 'react';
import { RouterProvider } from 'react-router';
import { bootstrapAuth, useAuthStore } from '@/shared/auth/store';
import { setLanguage } from '@/shared/i18n';
import { useMaxBridge } from '@/shared/max';
import { hydrateUiStore, useUiStore } from '@/shared/store/ui-store';
import { router } from './router';
import { Splash } from './splash';
import { applyStartParam } from './start-param';

/** Bootstrap (UI-store, сессия) → сплэш → роутер. */
export function App() {
  const bridge = useMaxBridge();
  const status = useAuthStore((s) => s.status);
  const theme = useAuthStore((s) => s.me?.settings.theme);
  const locale = useAuthStore((s) => s.me?.settings.locale);
  const activeRole = useAuthStore((s) => s.me?.activeRole);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    // Диплинк MAX (`startapp`, например приглашение родителя) — до входа и до роутера.
    applyStartParam(bridge, router);
    void (async () => {
      const off = await hydrateUiStore(bridge);
      if (cancelled) off();
      else unsubscribe = off;
      await bootstrapAuth(bridge);
      try {
        bridge.ready();
      } catch {
        /* SDK недоступен */
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [bridge]);

  // Настройки с сервера — источник правды после входа.
  useEffect(() => {
    if (theme) useUiStore.getState().setTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (locale) void setLanguage(locale);
  }, [locale]);

  // Акцент роли (макеты): у родителя зелёный, у преподавателя оранжевый — на всех экранах роли,
  // и в `/<role>/*`, и на общих (`/notifications`); у ученика и до входа — синий. До отрисовки,
  // без вспышки.
  useLayoutEffect(() => {
    applyAccent(activeRole === 'PARENT' ? 'green' : activeRole === 'TEACHER' ? 'orange' : 'blue');
  }, [activeRole]);

  // Системная кнопка «назад» в MAX → история роутера (в браузере её обрабатывает сам роутер).
  useEffect(() => {
    if (bridge.mode !== 'real') return;
    try {
      return bridge.on('back', () => void router.navigate(-1));
    } catch {
      return undefined;
    }
  }, [bridge]);

  if (status === 'idle' || status === 'loading') return <Splash />;
  return <RouterProvider router={router} />;
}
