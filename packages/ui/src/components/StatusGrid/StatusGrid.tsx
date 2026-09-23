import {
  forwardRef,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import { VisuallyHidden } from '../VisuallyHidden';
import './StatusGrid.css';

export interface StatusGridItem {
  key: string;
  /** Короткая подпись в ячейке (номер задания). */
  label: ReactNode;
  /** Окраска: success — зелёная, danger — красная, warning — жёлтая, neutral — серая. */
  tone: Tone;
  /** Полное описание для скринридера («Задание 9 — неправильно»). По умолчанию `label`. */
  title?: string;
}

export interface StatusGridProps extends Omit<
  HTMLAttributes<HTMLUListElement>,
  'aria-label' | 'onSelect'
> {
  items: StatusGridItem[];
  /** Число колонок. По умолчанию 7. */
  columns?: number;
  /** Нажатие на ячейку. Без него ячейки не интерактивны. */
  onSelect?: (key: string) => void;
  /** Доступное название сетки («Задания по робототехнике»). */
  'aria-label': string;
}

/** Следующая ячейка по стрелкам: ←/→ — соседняя, ↑/↓ — через ряд, Home/End — края. */
function getGridIndex(key: string, current: number, count: number, columns: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return Math.min(count - 1, current + 1);
    case 'ArrowLeft':
      return Math.max(0, current - 1);
    case 'ArrowDown':
      return current + columns < count ? current + columns : current;
    case 'ArrowUp':
      return current - columns >= 0 ? current - columns : current;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Сетка цветных ячеек-статусов (задания домашки): 7 колонок, высота ячейки 27px.
 * С `onSelect` ячейки — кнопки с одной точкой табуляции и навигацией стрелками.
 */
export const StatusGrid = forwardRef<HTMLUListElement, StatusGridProps>(function StatusGrid(
  { items, columns = 7, onSelect, className, style, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const [active, setActive] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(active, Math.max(0, items.length - 1));
  const safeColumns = Math.max(1, Math.round(columns));

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = getGridIndex(event.key, index, items.length, safeColumns);
    if (next == null) return;
    event.preventDefault();
    setActive(next);
    cells.current[next]?.focus();
  };

  return (
    <ul
      ref={ref}
      className={cx('ui-status-grid', className)}
      aria-label={ariaLabel}
      style={{ '--ui-status-grid-columns': safeColumns, ...style } as CSSProperties}
      {...rest}
    >
      {items.map((item, index) => (
        <li key={item.key} className="ui-status-grid__item">
          {onSelect ? (
            <button
              ref={(node) => {
                cells.current[index] = node;
              }}
              type="button"
              className="ui-status-grid__cell"
              data-tone={item.tone}
              aria-label={item.title}
              tabIndex={index === current ? 0 : -1}
              onFocus={() => setActive(index)}
              onClick={() => onSelect(item.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          ) : (
            <span className="ui-status-grid__cell" data-tone={item.tone}>
              {item.title ? (
                <>
                  <span aria-hidden="true">{item.label}</span>
                  <VisuallyHidden>{item.title}</VisuallyHidden>
                </>
              ) : (
                item.label
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
});
