import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';
import './DockSheet.css';

export interface DockSheetProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Открыта ли панель. При `false` ничего не рендерится. */
  open: boolean;
  /** Запрос на закрытие: Escape или тап мимо панели и якоря. */
  onClose: () => void;
  /**
   * Строка-якорь (например, «календарь · день · колокольчик»): вкладка панели встаёт на её
   * уровень, а кнопки якоря по бокам вкладки остаются видимыми и нажимаемыми («вырезы» панели
   * прозрачны). Тап по якорю панель не закрывает. Без якоря панель просто прижата к низу.
   */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Содержимое вкладки по центру верхнего края (выбранная дата). */
  tab: ReactNode;
  /** Узкая правая карточка (например, занятия выбранного дня); прокручивается. */
  aside?: ReactNode;
  /** Основная квадратная карточка (например, сетка месяца). */
  children?: ReactNode;
}

/** Расстояние от верха панели до середины вкладки (макет: вкладка 52px, текст 20px). */
const TAB_CENTER = 20;
/** Минимальная высота панели по макету (вкладка + две карточки 192px). */
const MIN_HEIGHT = 291;

/**
 * Нижняя панель со «вкладкой» из макета календаря: по центру верхнего края — вкладка с датой,
 * по бокам — вогнутые вырезы, сквозь которые видны кнопки строки-якоря; ниже — квадратная
 * карточка и узкая карточка рядом. Панель не модальная: страница над ней видна, тап мимо
 * или Escape закрывают её, фокус возвращается туда, где был. Перекрывает нижнее меню.
 */
export function DockSheet({
  open,
  onClose,
  anchorRef,
  tab,
  aside,
  children,
  className,
  style,
  ...rest
}: DockSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const tabId = useId();
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Верх панели следует за якорем (скролл, поворот экрана, клавиатура).
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const anchor = anchorRef?.current;
      if (!anchor) {
        setTop(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const wanted = rect.top + rect.height / 2 - TAB_CENTER;
      setTop(Math.max(0, Math.min(wanted, window.innerHeight - MIN_HEIGHT)));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [open, anchorRef]);

  // Фокус внутрь при открытии и обратно при закрытии; Escape и тап мимо закрывают.
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheet?.focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sheet?.contains(target) || anchorRef?.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      if (sheet?.contains(document.activeElement)) {
        previouslyFocused?.focus?.({ preventScroll: true });
      }
    };
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={sheetRef}
      className={cx('ui-dock-sheet', className)}
      role="dialog"
      aria-modal="false"
      aria-labelledby={tabId}
      tabIndex={-1}
      style={{ ...(top === null ? null : ({ top } as CSSProperties)), ...style }}
      {...rest}
    >
      <div className="ui-dock-sheet__tab">
        <div className="ui-dock-sheet__tab-label" id={tabId} aria-live="polite">
          {tab}
        </div>
      </div>
      <div className="ui-dock-sheet__body" data-aside={aside != null || undefined}>
        <div className="ui-dock-sheet__card">{children}</div>
        {aside != null && <div className="ui-dock-sheet__card ui-dock-sheet__aside">{aside}</div>}
      </div>
    </div>,
    document.body,
  );
}
