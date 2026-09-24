import { useEffect, useId, useRef, useState, type HTMLAttributes, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons';
import { cx } from '../../lib/cx';
import './MonthCalendar.css';

export interface MonthCalendarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Любая дата показываемого месяца. */
  month: Date;
  /** Листание месяцев (стрелки в шапке, PageUp/PageDown, уход стрелками за край месяца). */
  onMonthChange: (month: Date) => void;
  /** Выбранный день (заливка). */
  selected?: Date | null;
  onSelect: (date: Date) => void;
  /** «Сегодня» (обводка). По умолчанию — текущая дата устройства. */
  today?: Date;
  /** Дни с точкой под числом (например, есть занятия). */
  isMarked?: (date: Date) => boolean;
  /** Дополнение к доступному имени дня («есть занятия»). */
  describeDay?: (date: Date) => string | undefined;
  /** Локаль названий месяца и дней недели. По умолчанию `ru`. */
  locale?: string;
  /** Доступные имена кнопок листания. */
  prevLabel?: string;
  nextLabel?: string;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);
/** Понедельник = 0 … воскресенье = 6. */
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Недели месяца (пн–вс); дни чужого месяца — `null`. */
function buildWeeks(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function monthTitle(month: Date, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.getFullYear()}`;
}

/** Первый день, который получает фокус в месяце: выбранный → сегодня → 1-е число. */
function initialFocus(month: Date, selected: Date | null | undefined, today: Date): Date {
  if (selected && sameMonth(selected, month)) return selected;
  if (sameMonth(today, month)) return today;
  return new Date(month.getFullYear(), month.getMonth(), 1);
}

/**
 * Месячная сетка (пн–вс) для маленькой карточки: шапка «‹ Месяц Год ›», дни недели, числа.
 * Выбранный день залит основным цветом, сегодня — обведён, отмеченные дни — с точкой.
 * Клавиатура: стрелки (±день/неделя, с переходом месяца), Home/End (неделя), PageUp/PageDown.
 * Домена не знает.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  today = new Date(),
  isMarked,
  describeDay,
  locale = 'ru',
  prevLabel = 'Предыдущий месяц',
  nextLabel = 'Следующий месяц',
  className,
  ...rest
}: MonthCalendarProps) {
  const titleId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusDate, setFocusDate] = useState(() => initialFocus(month, selected, today));
  const focusPending = useRef(false);

  // Месяц сменили снаружи (шапка, выбор дня) — фокусная дата переезжает в него.
  if (!sameMonth(focusDate, month)) {
    setFocusDate(initialFocus(month, selected, today));
  }

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(focusDate)}"]`)?.focus();
  }, [focusDate]);

  const moveFocus = (next: Date) => {
    focusPending.current = true;
    setFocusDate(next);
    if (!sameMonth(next, month)) onMonthChange(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    let next: Date | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(date, -1);
        break;
      case 'ArrowRight':
        next = addDays(date, 1);
        break;
      case 'ArrowUp':
        next = addDays(date, -7);
        break;
      case 'ArrowDown':
        next = addDays(date, 7);
        break;
      case 'Home':
        next = addDays(date, -weekdayIndex(date));
        break;
      case 'End':
        next = addDays(date, 6 - weekdayIndex(date));
        break;
      case 'PageUp':
      case 'PageDown': {
        const shifted = addMonths(date, event.key === 'PageUp' ? -1 : 1);
        const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
        next = new Date(
          shifted.getFullYear(),
          shifted.getMonth(),
          Math.min(date.getDate(), lastDay),
        );
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    moveFocus(next);
  };

  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const weekdayLongFormat = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  // 5 января 2026 — понедельник: подписи дней недели начиная с пн.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 5 + i));

  return (
    <div className={cx('ui-month-calendar', className)} {...rest}>
      <div className="ui-month-calendar__header">
        <button
          type="button"
          className="ui-month-calendar__nav"
          aria-label={prevLabel}
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeftIcon size={14} />
        </button>
        <span className="ui-month-calendar__title" id={titleId} aria-live="polite">
          {monthTitle(month, locale)}
        </span>
        <button
          type="button"
          className="ui-month-calendar__nav"
          aria-label={nextLabel}
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>
      <div ref={gridRef} className="ui-month-calendar__grid" role="grid" aria-labelledby={titleId}>
        <div className="ui-month-calendar__row" role="row">
          {weekdays.map((day) => (
            <abbr
              key={day.getDay()}
              className="ui-month-calendar__weekday"
              role="columnheader"
              title={weekdayLongFormat.format(day)}
            >
              {weekdayFormat.format(day)}
            </abbr>
          ))}
        </div>
        {buildWeeks(month).map((week, row) => (
          <div key={row} className="ui-month-calendar__row" role="row">
            {week.map((date, col) => {
              if (!date) {
                return <span key={col} className="ui-month-calendar__cell" role="gridcell" />;
              }
              const isSelected = !!selected && sameDay(date, selected);
              const extra = describeDay?.(date);
              return (
                <span
                  key={col}
                  className="ui-month-calendar__cell"
                  role="gridcell"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    className="ui-month-calendar__day"
                    data-day={dayKey(date)}
                    data-marked={isMarked?.(date) || undefined}
                    aria-pressed={isSelected}
                    aria-current={sameDay(date, today) ? 'date' : undefined}
                    aria-label={
                      extra ? `${dayFormat.format(date)}, ${extra}` : dayFormat.format(date)
                    }
                    tabIndex={sameDay(date, focusDate) ? 0 : -1}
                    onClick={() => {
                      setFocusDate(date);
                      onSelect(date);
                    }}
                    onKeyDown={(event) => onKeyDown(event, date)}
                  >
                    {date.getDate()}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
