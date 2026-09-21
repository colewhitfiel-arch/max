import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './CardColumns.css';

export interface CardColumn {
  key: string;
  /** Заголовок колонки (первая строка карточки). */
  header: ReactNode;
  /** Выравнивание ячеек. По умолчанию `start`. */
  align?: 'start' | 'center' | 'end';
  /** Не переносить содержимое ячеек (время, числа); ширина — по содержимому. */
  nowrap?: boolean;
  /**
   * Ширина по содержимому, но не более 45% таблицы (основная колонка, которую
   * не хочется переносить). Без флага колонка делит остаток поровну с другими.
   */
  fit?: boolean;
}

export interface CardColumnsRow {
  key: string;
  /** Ячейки по ключу колонки. */
  cells: Record<string, ReactNode>;
}

export interface CardColumnsProps extends HTMLAttributes<HTMLDivElement> {
  columns: CardColumn[];
  rows: CardColumnsRow[];
}

/**
 * Таблица из отдельных карточек-колонок: каждая колонка — своя карточка, но строки
 * выровнены между колонками (CSS subgrid), даже если текст переносится.
 */
export const CardColumns = forwardRef<HTMLDivElement, CardColumnsProps>(function CardColumns(
  { columns, rows, className, style, ...rest },
  ref,
) {
  const template = columns
    .map((column) => (column.nowrap ? 'auto' : column.fit ? 'fit-content(45%)' : 'minmax(0, 1fr)'))
    .join(' ');
  const vars = {
    '--ui-card-columns-template': template,
    '--ui-card-columns-rows': rows.length + 1,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={cx('ui-card-columns', className)}
      role="table"
      style={{ ...vars, ...style }}
      {...rest}
    >
      {columns.map((column) => (
        <div
          key={column.key}
          className="ui-card-columns__column"
          role="rowgroup"
          data-align={column.align ?? 'start'}
          data-nowrap={column.nowrap || undefined}
        >
          <div className="ui-card-columns__cell ui-card-columns__header" role="columnheader">
            {column.header}
          </div>
          {rows.map((row) => (
            <div key={row.key} className="ui-card-columns__cell" role="cell">
              {row.cells[column.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
