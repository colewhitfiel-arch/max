import { Chip, Coachmark, type CoachmarkRect, Inline, Stack, Text, useToast } from '@edu/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { AUTH_PATH } from '@/shared/auth/role-routes';
import { effectiveAuthMode } from '@/shared/auth/store';
import { useMaxBridge } from '@/shared/max';
import { findTourTarget, prepareStep } from '../model/prepare';
import { DEMO_STEPS, type DemoSection, firstStepOf } from '../model/steps';
import { useDemoTourStore } from '../model/store';

const ROLE_SECTIONS: DemoSection[] = ['student', 'parent', 'teacher'];
/** Как часто сверяем положение цели (подгрузка картинок, анимации сдвигают вёрстку). */
const TRACK_MS = 250;

const sameRect = (a: CoachmarkRect | null, b: DOMRect) =>
  a !== null &&
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.height === b.height;

/** Положение подсвечиваемого элемента шага во viewport; null — цели нет (или шаг без цели). */
function useTargetRect(target: string | undefined, enabled: boolean): CoachmarkRect | null {
  const [rect, setRect] = useState<CoachmarkRect | null>(null);
  useEffect(() => {
    if (!enabled || !target) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const next = findTourTarget(target)?.getBoundingClientRect();
      setRect((prev) => {
        if (!next) return null;
        if (sameRect(prev, next)) return prev;
        return { top: next.top, left: next.left, width: next.width, height: next.height };
      });
    };
    measure();
    const timer = setInterval(measure, TRACK_MS);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [target, enabled]);
  return rect;
}

/**
 * Демонстрационный режим (для жюри): тур по всем ролям поверх настоящего приложения. На каждом
 * шаге входит нужным демо-пользователем, открывает экран, подсвечивает функцию и объясняет её.
 * Монтируется один раз внутри роутера (корневой layout), без тура ничего не рендерит.
 * «Готово» на последнем шаге выходит из демо-аккаунта и возвращает к началу: внутри MAX автовход
 * по подписи ведёт к выбору роли (у нового пользователя ролей нет), в браузере — экран входа.
 * Крестик просто закрывает тур: можно остаться в приложении демо-пользователем.
 */
export function DemoTour() {
  const { t } = useTranslation('demo');
  const navigate = useNavigate();
  const toast = useToast();
  const bridge = useMaxBridge();
  const { logout } = useAuth();
  /** Идёт выход из демо-аккаунта после «Готово». */
  const [leaving, setLeaving] = useState(false);
  const { active, index, go, stop } = useDemoTourStore(
    useShallow((s) => ({ active: s.active, index: s.index, go: s.go, stop: s.stop })),
  );
  /** Шаг, для которого экран уже открыт и цель найдена. */
  const [prepared, setPrepared] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setPrepared(null);
      return undefined;
    }
    const step = DEMO_STEPS[index];
    if (!step) return undefined;
    let cancelled = false;
    prepareStep(
      step,
      (path, options) => navigate(path, options),
      () => cancelled,
    )
      .then(() => {
        if (!cancelled) setPrepared(index);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.show({
          tone: 'danger',
          title: t('loginFailed'),
          description: describeApiError(error),
        });
        stop();
      });
    return () => {
      cancelled = true;
    };
    // navigate/toast/t стабильны; шаг определяется индексом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Пока новый шаг готовится на том же экране тем же пользователем, карточка прошлого шага
  // остаётся на месте (без мигания); переход на другой экран — затемнение со спиннером.
  const current = DEMO_STEPS[index];
  const previous = prepared === null ? undefined : DEMO_STEPS[prepared];
  const sameScreen =
    previous !== undefined &&
    current !== undefined &&
    (current.path ?? previous.path) === previous.path &&
    (current.persona ?? previous.persona) === previous.persona;
  const ready = prepared === index;
  const shownIndex = ready || !sameScreen || prepared === null ? index : prepared;
  const shown = DEMO_STEPS[shownIndex];
  const busy = !ready && !sameScreen;
  const rect = useTargetRect(shown?.target, active && !busy);

  if (!active || !shown) return null;

  const isWelcome = shownIndex === 0;
  const isLast = shownIndex === DEMO_STEPS.length - 1;
  // Куда вернёт «Готово»: внутри MAX — к выбору роли, в браузере — на экран входа.
  const textKey = isLast && effectiveAuthMode(bridge) !== 'max' ? 'textLogin' : 'text';

  const finish = async () => {
    setLeaving(true);
    try {
      await logout();
    } finally {
      // Без `state.from`: после входа — на корень (выбор роли), а не на последний экран тура.
      void navigate(AUTH_PATH, { replace: true });
      stop();
      setLeaving(false);
    }
  };

  return (
    <Coachmark
      open
      // Подсвеченное можно потрогать: написать тьютору, раскрыть карточку, открыть задание.
      interactive
      overlaySide={shown.overlaySide}
      busy={busy || leaving}
      target={rect}
      eyebrow={t(`sections.${shown.section}`)}
      title={t(`steps.${shown.id}.title`)}
      step={shownIndex + 1}
      total={DEMO_STEPS.length}
      onNext={() => (isLast ? void finish() : go(shownIndex + 1))}
      onPrev={() => go(shownIndex - 1)}
      onClose={stop}
      nextLabel={t('controls.next')}
      prevLabel={t('controls.prev')}
      doneLabel={t('controls.done')}
      endLabel={t('controls.end')}
      closeLabel={t('controls.close')}
      counterLabel={t('controls.counter', { step: shownIndex + 1, total: DEMO_STEPS.length })}
      busyLabel={t('controls.loading')}
      data-testid="demo-tour"
    >
      <Stack gap={3}>
        <Text variant="small">{t(`steps.${shown.id}.${textKey}`)}</Text>
        {isWelcome && (
          <Stack gap={2}>
            <Text variant="caption" tone="muted">
              {t('jumpTo')}
            </Text>
            <Inline gap={2}>
              {ROLE_SECTIONS.map((section) => (
                <Chip key={section} onClick={() => go(firstStepOf(section))}>
                  {t(`sections.${section}`)}
                </Chip>
              ))}
            </Inline>
          </Stack>
        )}
      </Stack>
    </Coachmark>
  );
}
