import { applyAccent } from '@edu/ui';
import { useEffect, useLayoutEffect } from 'react';
import { RouterProvider } from 'react-router';
import { bootstrapAuth, useAuthStore } from '@/shared/auth/store';
import { DEFAULT_LANGUAGE, setLanguage } from '@/shared/i18n';
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
  const activeRole = useAuthStore((s) => s.me?.activeRole);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    // Диплинк MAX (`startapp`, например приглашение родителя) — до входа и до роутера. Вход ждёт
    // конца перехода: иначе редирект с `/` отменит его, пока грузится lazy-экран приглашения.
    const startParam = applyStartParam(bridge, router);
    void (async () => {
      const off = await hydrateUiStore(bridge);
      if (cancelled) off();
      else unsubscribe = off;
      await startParam;
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

  // Тема с сервера — источник правды после входа.
  useEffect(() => {
    if (theme) useUiStore.getState().setTheme(theme);
  }, [theme]);
  // Язык — всегда DEFAULT_LANGUAGE: выбора языка нет ни у одной роли (docs/00 §1.4, docs/07),
  // поэтому `me.settings.locale` с сервера (выбранный раньше или из клиента MAX) не применяется —
  // иначе пользователь застрял бы в языке, который не может сменить.
  useEffect(() => {
    void setLanguage(DEFAULT_LANGUAGE);
  }, []);

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
