import { forwardRef, useId, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import type { Tone } from '../../types';
import './CardColumns.css';

export interface CardColumn {
  key: string;
  /** Заголовок колонки (первая строка карточки; у `compact` — подпись над карточкой). */
  header: ReactNode;
  /** Выравнивание ячеек. По умолчанию `start`. */
  align?: 'start' | 'center' | 'end';
  /** Не переносить содержимое ячеек (время, числа); ширина — по содержимому. */
  nowrap?: boolean;
  /**
   * Ширина по содержимому (основная колонка, которую не хочется переносить). Если в таблице
   * есть «резиновая» колонка (без `nowrap`/`fit`/`weight`) — не более 45% таблицы, чтобы
   * оставить ей место; рядом только с `nowrap`-колонками — всё, что они оставят. Без флага
   * колонка делит остаток поровну с другими.
   */
  fit?: boolean;
  /**
   * Доля ширины (`minmax(0, <weight>fr)`) вместо равных долей; перекрывает `nowrap`/`fit`
   * по ширине (перенос `nowrap` при этом сохраняется). Нужна, чтобы несколько блоков одной
   * таблицы (дни в кошельке) были выровнены между собой: кошелёк — 52 / 125 / 68 / 76.
   */
  weight?: number;
  /**
   * Действие под карточкой колонки — полоса primary «+ Добавить кружок» из макета
   * родителя (карточка снизу срастается с полосой). Высота таблицы учитывает полосу.
   */
  action?: CardColumnAction;
}

export interface CardColumnAction {
  /** Текст кнопки («Добавить кружок»). */
  label: ReactNode;
  onClick: () => void;
}

export interface CardColumnsRow {
  key: string;
  /** Ячейки по ключу колонки. */
  cells: Record<string, ReactNode>;
  /**
   * Подложка строки цветом тона на 10% на всю ширину карточек (строка «Вывод» в кошельке —
   * `danger`). Перекрывает полосу `striped`.
   */
  tone?: Tone;
}

/** `default` — заголовки внутри карточек (главная); `compact` — кошелёк: 12px, заголовки над карточками. */
export type CardColumnsVariant = 'default' | 'compact';

/** Какие строки данных подложены полосой: `odd` — 1-я, 3-я…; `even` — 2-я, 4-я… */
export type CardColumnsStripes = 'odd' | 'even';

export interface CardColumnsProps extends HTMLAttributes<HTMLDivElement> {
  columns: CardColumn[];
  rows: CardColumnsRow[];
  /**
   * `compact` (кошелёк репетитора): ячейки 12px, заголовки колонок над карточками
   * (11px medium, приглушённые), зазор между колонками 7px. По умолчанию `default`.
   */
  variant?: CardColumnsVariant;
  /**
   * «Зебра»: строки данных подложены полосой на всю ширину карточки (у краёв карточки полоса
   * скругляется вместе с ней). `true` = `'odd'` (1-я, 3-я…); `'even'` — со 2-й строки, чтобы
   * продолжить чередование в следующем блоке той же таблицы.
   */
  striped?: boolean | CardColumnsStripes;
  /**
   * Показывать заголовки колонок. По умолчанию `true`. `false` — у второго и следующих блоков
   * одной таблицы (день «сегодня»): заголовки остаются только для скринридера.
   */
  showHeader?: boolean;
  /**
   * Мелкая подпись над правым краем блока с линией под ней («вчера» / «сегодня» в кошельке).
   * Вешается над верхним краем карточек и не сдвигает таблицу.
   */
  caption?: ReactNode;
  /**
   * Плотная таблица для узких экранов: при ширине таблицы меньше 384px (экраны до 414px)
   * ячейки 13px, заголовки 14px, поля карточек 5px — как у всех таблиц уже 358px. Для таблиц
   * с тремя «широкими» колонками (главная родителя: Название / Репетитор / Время), где иначе
   * длинное название («Программирование») рвётся на 390–414px. По умолчанию `false`.
   */
  dense?: boolean;
}

function isWeighted(column: CardColumn): boolean {
  return column.weight !== undefined && Number.isFinite(column.weight) && column.weight > 0;
}

/** Колонка делит остаток ширины (`fr`): доля `weight` или колонка без `nowrap`/`fit`. */
function isFlexible(column: CardColumn): boolean {
  return isWeighted(column) || (!column.nowrap && !column.fit);
}

function columnTrack(column: CardColumn, capFit: boolean): string {
  if (isWeighted(column)) return `minmax(0, ${column.weight}fr)`;
  if (column.nowrap) return 'auto';
  if (column.fit) {
    // Потолок 45% нужен, только чтобы оставить место `fr`-колонкам: рядом с одними `auto`
    // (nowrap) сетка и так делит место поровну и отдаёт им их ширину первыми, а потолок лишь
    // зря рвёт название на узком экране («Программирование» на 375px).
    return capFit ? 'fit-content(45%)' : 'auto';
  }
  return 'minmax(0, 1fr)';
}

function isStriped(striped: CardColumnsProps['striped'], index: number): boolean {
  if (!striped) return false;
  return striped === 'even' ? index % 2 === 1 : index % 2 === 0;
}

/**
 * Таблица из отдельных карточек-колонок: каждая колонка — своя карточка, но строки
 * выровнены между колонками (CSS subgrid), даже если текст переносится.
 *
 * Доступность: DOM идёт по колонкам (так требует subgrid), а таблица читается по строкам —
 * обёртки колонок без роли (`role="none"`), строки `role="row"` — пустые узлы вне сетки,
 * собирающие свои ячейки через `aria-owns`.
 */
export const CardColumns = forwardRef<HTMLDivElement, CardColumnsProps>(function CardColumns(
  {
    columns,
    rows,
    variant = 'default',
    striped = false,
    showHeader = true,
    caption,
    dense = false,
    className,
    style,
    ...rest
  },
  ref,
) {
  const compact = variant === 'compact';
  const capFit = columns.some(isFlexible);
  const template = columns.map((column) => columnTrack(column, capFit)).join(' ');
  const vars = {
    '--ui-card-columns-template': template,
    // Строка заголовков занимает строку сетки, только когда видна.
    '--ui-card-columns-rows': Math.max(1, rows.length + (showHeader ? 1 : 0)),
  } as CSSProperties;
  const hasAction = columns.some((column) => column.action);
  const lastRow = rows.length - 1;
  const baseId = useId();
  const headerId = (col: number) => `${baseId}-h${col}`;
  const cellId = (row: number, col: number) => `${baseId}-r${row}c${col}`;
  const actionId = (col: number) => `${baseId}-a${col}`;

  const header = (column: CardColumn, col: number) => (
    <div
      key={column.key}
      id={headerId(col)}
      className={
        showHeader ? 'ui-card-columns__cell ui-card-columns__header' : 'ui-visually-hidden'
      }
      role="columnheader"
    >
      {column.header}
    </div>
  );

  return (
    <div
      ref={ref}
      className={cx('ui-card-columns', className)}
      role="table"
      data-variant={variant}
      data-header={showHeader ? undefined : 'hidden'}
      data-has-action={hasAction || undefined}
      data-dense={dense || undefined}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {caption != null && caption !== false && (
        <div className="ui-card-columns__caption" role="caption">
          {caption}
        </div>
      )}
      {compact && (
        // Заголовки над карточками — отдельная строка той же сетки (subgrid по колонкам).
        <div className={showHeader ? 'ui-card-columns__head' : 'ui-visually-hidden'} role="none">
          {columns.map(header)}
        </div>
      )}
      {columns.map((column, col) => (
        <div
          key={column.key}
          className="ui-card-columns__column"
          role="none"
          data-align={column.align ?? 'start'}
          data-nowrap={column.nowrap || undefined}
          data-action={column.action ? '' : undefined}
        >
          {!compact && header(column, col)}
          {rows.map((row, index) => {
            const stripe = isStriped(striped, index);
            const filled = stripe || row.tone !== undefined;
            return (
              <div
                key={row.key}
                id={cellId(index, col)}
                className="ui-card-columns__cell"
                role="cell"
                data-stripe={stripe || undefined}
                data-tone={row.tone}
                data-first={(filled && index === 0) || undefined}
                data-last={(filled && index === lastRow) || undefined}
              >
                {row.cells[column.key]}
              </div>
            );
          })}
          {column.action && (
            // Вне сетки строк (subgrid не растягивается): полоса висит под карточкой.
            <div className="ui-card-columns__action-cell" id={actionId(col)} role="cell">
              <button
                type="button"
                className="ui-card-columns__action"
                onClick={column.action.onClick}
              >
                <svg
                  className="ui-card-columns__action-plus"
                  width={9}
                  height={9}
                  viewBox="0 0 9 9"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4.5.5v8M.5 4.5h8" stroke="currentColor" strokeLinecap="round" />
                </svg>
                {column.action.label}
              </button>
            </div>
          )}
        </div>
      ))}
      {/* Строки для скринридера: вне потока сетки, ячейки — через aria-owns. */}
      <div
        className="ui-card-columns__row"
        role="row"
        aria-owns={columns.map((_, col) => headerId(col)).join(' ')}
      />
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="ui-card-columns__row"
          role="row"
          aria-owns={columns.map((_, col) => cellId(index, col)).join(' ')}
        />
      ))}
      {hasAction && (
        <div
          className="ui-card-columns__row"
          role="row"
          aria-owns={columns
            .flatMap((column, col) => (column.action ? [actionId(col)] : []))
            .join(' ')}
        />
      )}
    </div>
  );
});
