import { forwardRef, type ReactNode, type TableHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './DataTable.css';

/** Цвет значений колонки (как `Text tone`). */
export type DataTableTone = 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'danger';

export interface DataTableColumn {
  key: string;
  /** Заголовок над карточкой («Правильно выполненные дз»). */
  header: ReactNode;
  /** Выравнивание заголовка и ячеек. По умолчанию `start`. */
  align?: 'start' | 'center' | 'end';
  /** Доля ширины таблицы (по умолчанию 1): 1 / 2 / 1.5 → 22% / 45% / 33%. */
  weight?: number;
  /** Цвет значений колонки (правильно — `success`, выполненные — `primary`). */
  tone?: DataTableTone;
}

export interface DataTableRow {
  key: string;
  /** Ячейки по ключу колонки. */
  cells: Record<string, ReactNode>;
  /**
   * Строка кликабельна целиком (переход к группе). Для клавиатуры и скринридера в первой
   * ячейке — кнопка; клик мышью или пальцем по любому месту строки делает то же.
   */
  onClick?: () => void;
  /** Доступное название кнопки строки («Группа 001: ученики»). По умолчанию — первая ячейка. */
  'aria-label'?: string;
}

export interface DataTableProps extends Omit<TableHTMLAttributes<HTMLTableElement>, 'children'> {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** Подпись таблицы для скринридера (`<caption>`, визуально скрыта). */
  caption?: ReactNode;
}

function weightOf(column: DataTableColumn): number {
  return column.weight !== undefined && Number.isFinite(column.weight) && column.weight > 0
    ? column.weight
    : 1;
}

/**
 * Настоящая таблица (`<table>`) из макета успеваемости: заголовки колонок над карточкой
 * (11px medium, приглушённые, без фона), тело — одна карточка поверхности с радиусом 20,
 * строки 44px, значения 12px medium. Строки с `onClick` кликабельны целиком, фокус виден.
 */
export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(function DataTable(
  { columns, rows, caption, className, ...rest },
  ref,
) {
  const total = columns.reduce((sum, column) => sum + weightOf(column), 0);
  const [first] = columns;
  return (
    <table ref={ref} className={cx('ui-data-table', className)} {...rest}>
      {caption != null && caption !== false && (
        <caption className="ui-visually-hidden">{caption}</caption>
      )}
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={{ width: `${(weightOf(column) / total) * 100}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="ui-data-table__header"
              data-align={column.align ?? 'start'}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className="ui-data-table__row"
            data-clickable={row.onClick ? '' : undefined}
            // Мышь и палец — по всей строке; клавиатура — через кнопку в первой ячейке
            // (её клик всплывает сюда же, обработчик один).
            onClick={row.onClick ? () => row.onClick?.() : undefined}
          >
            {columns.map((column) => {
              const content = row.cells[column.key];
              return (
                <td
                  key={column.key}
                  className="ui-data-table__cell"
                  data-align={column.align ?? 'start'}
                  data-tone={column.tone && column.tone !== 'default' ? column.tone : undefined}
                >
                  {row.onClick && column === first ? (
                    <button
                      type="button"
                      className="ui-data-table__row-button"
                      aria-label={row['aria-label']}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
});
