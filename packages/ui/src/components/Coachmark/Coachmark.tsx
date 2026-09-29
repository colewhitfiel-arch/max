import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../icons';
import { cx } from '../../lib/cx';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Spinner } from '../Spinner';
import { VisuallyHidden } from '../VisuallyHidden';
import { placeCoachmark, type CoachmarkPlacement, type CoachmarkRect } from './placement';
import './Coachmark.css';

export type { CoachmarkRect } from './placement';

export interface CoachmarkProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Показан ли тур. При `false` ничего не рендерится. */
  open: boolean;
  /**
   * Подсвечиваемый элемент во viewport (`getBoundingClientRect()`); `null` — шаг без цели,
   * карточка по центру на затемнённом фоне.
   */
  target: CoachmarkRect | null;
  /** Заголовок шага; связывается с карточкой через `aria-labelledby`. */
  title: ReactNode;
  /** Текст шага (и любое содержимое: чипы, ссылки). */
  children?: ReactNode;
  /** Надпись над заголовком — раздел тура («Ученик»). */
  eyebrow?: ReactNode;
  /** Номер шага, с 1. */
  step: number;
  /** Всего шагов. */
  total: number;
  /** «Далее»; на последнем шаге — «Готово». */
  onNext: () => void;
  /** «Назад». На первом шаге вместо неё — «Завершить» (`onClose`). */
  onPrev: () => void;
  /** Закрыть тур: крестик, Escape, «Завершить» на первом шаге. */
  onClose: () => void;
  /**
   * Переход к шагу ещё идёт (открывается экран): вместо карточки — спиннер на затемнении,
   * клавиши и кнопки не работают.
   */
  busy?: boolean;
  /** На сколько подсветка шире цели с каждой стороны, px. По умолчанию 8. */
  padding?: number;
  /**
   * Подсвеченный элемент остаётся живым: клики и ввод внутри «окна» доходят до приложения
   * (попробовать чат, раскрыть карточку). Остальной экран всё равно закрыт. По умолчанию `false`.
   */
  interactive?: boolean;
  /**
   * Край экрана для карточки, если цель высокая и карточка не влезла ни под ней, ни над ней:
   * `bottom` (по умолчанию) или `top` — например, у чата, где новые реплики внизу.
   */
  overlaySide?: 'top' | 'bottom';
  /** Подпись «Далее». */
  nextLabel?: string;
  /** Подпись «Назад». */
  prevLabel?: string;
  /** Подпись кнопки последнего шага. По умолчанию «Готово». */
  doneLabel?: string;
  /** Подпись кнопки выхода на первом шаге. По умолчанию «Завершить». */
  endLabel?: string;
  /** Доступное имя крестика. По умолчанию «Закрыть». */
  closeLabel?: string;
  /** Доступное имя счётчика шагов. По умолчанию «Шаг N из M». */
  counterLabel?: string;
  /** Доступное имя спиннера перехода. По умолчанию «Загрузка». */
  busyLabel?: string;
}

const MARGIN = 16;
const GAP = 14;

function useViewport() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => setViewport(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

const samePlacement = (a: CoachmarkPlacement | null, b: CoachmarkPlacement) =>
  a !== null &&
  a.top === b.top &&
  a.left === b.left &&
  a.side === b.side &&
  a.arrowX === b.arrowX &&
  a.spotlight?.top === b.spotlight?.top &&
  a.spotlight?.left === b.spotlight?.left &&
  a.spotlight?.width === b.spotlight?.width &&
  a.spotlight?.height === b.spotlight?.height;

/**
 * Шаг обучающего тура (coachmark): экран затемнён, цель подсвечена «окном», рядом карточка
 * со стрелкой — заголовок, текст, «Назад» · «N/M» · «Далее» и крестик. Портал в body поверх
 * модалок; клики по приложению под затемнением не проходят (с `interactive` — проходят внутри
 * «окна»). Escape — закрыть, ←/→ — шаги (кроме ввода в поле).
 * Позицию цели считает потребитель (и обновляет при прокрутке/ресайзе), компонент только
 * раскладывает карточку: под целью, над ней или поверх, если не влезла.
 */
export function Coachmark({
  open,
  target,
  title,
  children,
  eyebrow,
  step,
  total,
  onNext,
  onPrev,
  onClose,
  busy = false,
  padding = 8,
  interactive = false,
  overlaySide = 'bottom',
  nextLabel = 'Далее',
  prevLabel = 'Назад',
  doneLabel = 'Готово',
  endLabel = 'Завершить',
  closeLabel = 'Закрыть',
  counterLabel,
  busyLabel = 'Загрузка',
  className,
  ...rest
}: CoachmarkProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const viewport = useViewport();
  const [placement, setPlacement] = useState<CoachmarkPlacement | null>(null);
  const first = step <= 1;
  const last = step >= total;
  const cardShown = open && !busy;

  useFocusTrap(cardRef, cardShown, nextRef);

  // Размер карточки зависит от текста шага: раскладываем при смене цели/экрана и при каждом
  // изменении размера карточки (новый шаг, перенос строк). Одинаковую раскладку не сохраняем.
  const targetTop = target?.top;
  const targetLeft = target?.left;
  const targetWidth = target?.width;
  const targetHeight = target?.height;
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!cardShown || !card) return undefined;
    const rect =
      targetTop === undefined ||
      targetLeft === undefined ||
      targetWidth === undefined ||
      targetHeight === undefined
        ? null
        : { top: targetTop, left: targetLeft, width: targetWidth, height: targetHeight };
    const place = () => {
      const next = placeCoachmark(
        rect,
        { width: card.offsetWidth, height: card.offsetHeight },
        viewport,
        { margin: MARGIN, gap: GAP, padding, overlaySide },
      );
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    };
    place();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(place);
    observer.observe(card);
    return () => observer.disconnect();
  }, [
    cardShown,
    targetTop,
    targetLeft,
    targetWidth,
    targetHeight,
    viewport,
    padding,
    overlaySide,
    step,
  ]);

  // Клавиши — на документе: фокус может остаться в приложении под затемнением.
  const handlers = useRef({ onNext, onPrev, onClose });
  handlers.current = { onNext, onPrev, onClose };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Ввод в поле подсвеченного элемента (interactive) — не листаем тур стрелками курсора.
      if (event.defaultPrevented || isEditable(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        handlers.current.onClose();
      } else if (busy) {
        return;
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.current.onNext();
      } else if (event.key === 'ArrowLeft' && !first) {
        event.preventDefault();
        handlers.current.onPrev();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, first]);

  if (!open) return null;

  const spotlight = cardShown ? placement?.spotlight : null;

  return createPortal(
    <div className={cx('ui-coachmark', className)} data-state={busy ? 'busy' : 'open'} {...rest}>
      {/* Подсветка есть всегда: без цели «окно» сжато в точку по центру и тень затемняет весь
          экран — переходы между шагами анимируются, а не мигают. */}
      <div
        className="ui-coachmark__spotlight"
        aria-hidden="true"
        data-empty={spotlight ? undefined : 'true'}
        style={
          spotlight
            ? {
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
              }
            : { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }
        }
      />
      {/* Щит от кликов: весь экран или, у interactive, всё вокруг «окна». */}
      {interactive && spotlight ? (
        <>
          <div
            className="ui-coachmark__shield"
            style={{ top: 0, left: 0, right: 0, height: spotlight.top }}
          />
          <div
            className="ui-coachmark__shield"
            style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="ui-coachmark__shield"
            style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }}
          />
          <div
            className="ui-coachmark__shield"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
          />
        </>
      ) : (
        <div className="ui-coachmark__shield" style={{ inset: 0 }} />
      )}
      {busy ? (
        <div className="ui-coachmark__busy">
          <Spinner size="lg" label={busyLabel} />
        </div>
      ) : (
        <div
          ref={cardRef}
          className="ui-coachmark__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={children != null ? bodyId : undefined}
          tabIndex={-1}
          data-side={placement?.side}
          // До первой раскладки карточка невидима: иначе мигнёт в левом верхнем углу.
          data-placed={placement ? 'true' : undefined}
          style={placement ? { top: placement.top, left: placement.left } : undefined}
        >
          {placement?.arrowX != null && (
            <span
              className="ui-coachmark__arrow"
              aria-hidden="true"
              style={{ left: placement.arrowX }}
            />
          )}
          <div className="ui-coachmark__header">
            <div className="ui-coachmark__heading">
              {eyebrow != null && <span className="ui-coachmark__eyebrow">{eyebrow}</span>}
              <h2 className="ui-coachmark__title" id={titleId}>
                {title}
              </h2>
            </div>
            <IconButton
              className="ui-coachmark__close"
              aria-label={closeLabel}
              size="sm"
              onClick={onClose}
            >
              <CloseIcon />
            </IconButton>
          </div>
          {children != null && (
            <div className="ui-coachmark__body" id={bodyId}>
              {children}
            </div>
          )}
          <div className="ui-coachmark__footer">
            <Button variant="secondary" size="sm" onClick={first ? onClose : onPrev}>
              {first ? endLabel : prevLabel}
            </Button>
            <span className="ui-coachmark__counter">
              <span aria-hidden="true">
                {step}/{total}
              </span>
              <VisuallyHidden>{counterLabel ?? `Шаг ${step} из ${total}`}</VisuallyHidden>
            </span>
            <Button ref={nextRef} size="sm" onClick={onNext}>
              {last ? doneLabel : nextLabel}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
