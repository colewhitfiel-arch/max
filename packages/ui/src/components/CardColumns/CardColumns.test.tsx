import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardColumns } from './CardColumns';

/** Карточки-колонки (обёртки без роли: DOM идёт по колонкам, строки — через aria-owns). */
const columnsOf = (table: HTMLElement) =>
  Array.from(table.querySelectorAll<HTMLElement>('.ui-card-columns__column'));

const rows = [
  { key: 'r1', cells: { name: 'Робототехника', time: '17:00-18:30' } },
  { key: 'r2', cells: { name: 'Шахматы', time: '19:00-20:30' } },
];

describe('CardColumns', () => {
  it('колонки-карточки с заголовками и ячейками', () => {
    render(
      <CardColumns
        aria-label="Расписание"
        columns={[
          { key: 'name', header: 'Название' },
          { key: 'time', header: 'Время', nowrap: true },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Расписание' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getAllByRole('cell')).toHaveLength(4);
    expect(table).not.toHaveAttribute('data-has-action');
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  it('dense: data-dense только при включённом пропе', () => {
    const { rerender } = render(
      <CardColumns
        aria-label="Расписание"
        columns={[{ key: 'name', header: 'Название' }]}
        rows={rows}
      />,
    );
    expect(screen.getByRole('table')).not.toHaveAttribute('data-dense');
    rerender(
      <CardColumns
        aria-label="Расписание"
        columns={[{ key: 'name', header: 'Название' }]}
        rows={rows}
        dense
      />,
    );
    expect(screen.getByRole('table')).toHaveAttribute('data-dense');
  });

  it('ARIA: строки row собирают ячейки по строкам через aria-owns', () => {
    render(
      <CardColumns
        aria-label="Расписание"
        columns={[
          { key: 'name', header: 'Название', action: { label: 'Добавить', onClick: () => {} } },
          { key: 'time', header: 'Время' },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Расписание' });
    expect(within(table).queryByRole('rowgroup')).not.toBeInTheDocument();
    const owned = within(table)
      .getAllByRole('row')
      .map((row) =>
        (row.getAttribute('aria-owns') ?? '')
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent),
      );
    expect(owned).toEqual([
      ['Название', 'Время'],
      ['Робототехника', '17:00-18:30'],
      ['Шахматы', '19:00-20:30'],
      ['Добавить'],
    ]);
  });

  it('action колонки — кнопка под её карточкой', async () => {
    const onClick = vi.fn();
    render(
      <CardColumns
        aria-label="Расписание"
        columns={[
          { key: 'name', header: 'Название', action: { label: 'Добавить кружок', onClick } },
          { key: 'time', header: 'Время', nowrap: true },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Расписание' });
    expect(table).toHaveAttribute('data-has-action');
    const [nameColumn, timeColumn] = columnsOf(table);
    const button = within(nameColumn!).getByRole('button', { name: 'Добавить кружок' });
    expect(within(timeColumn!).queryByRole('button')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('striped: полоса на нечётных строках (или с чётной), тон строки перекрывает полосу', () => {
    const three = [
      ...rows,
      { key: 'r3', cells: { name: 'Вывод', time: '19:00' }, tone: 'danger' as const },
    ];
    const columns = [
      { key: 'name', header: 'Название' },
      { key: 'time', header: 'Время', nowrap: true },
    ];
    const { rerender } = render(
      <CardColumns aria-label="Транзакции" columns={columns} rows={three} striped />,
    );
    const table = screen.getByRole('table', { name: 'Транзакции' });
    const nameCells = within(columnsOf(table)[0]!).getAllByRole('cell');
    expect(nameCells.map((cell) => cell.hasAttribute('data-stripe'))).toEqual([true, false, true]);
    // Первая и последняя подложенные строки помечены — у краёв карточки полоса скругляется.
    expect(nameCells[0]).toHaveAttribute('data-first');
    expect(nameCells[2]).toHaveAttribute('data-last');
    expect(nameCells[2]).toHaveAttribute('data-tone', 'danger');
    expect(nameCells[1]).not.toHaveAttribute('data-first');

    rerender(<CardColumns aria-label="Транзакции" columns={columns} rows={three} striped="even" />);
    const evenCells = within(columnsOf(table)[1]!).getAllByRole('cell');
    expect(evenCells.map((cell) => cell.hasAttribute('data-stripe'))).toEqual([false, true, false]);

    rerender(<CardColumns aria-label="Транзакции" columns={columns} rows={rows} />);
    expect(table.querySelector('[data-stripe]')).toBeNull();
  });

  it('compact: заголовки отдельной строкой над карточками, weight задаёт доли ширины', () => {
    render(
      <CardColumns
        aria-label="Транзакции"
        variant="compact"
        columns={[
          { key: 'name', header: 'ФИО ученика', weight: 125 },
          { key: 'time', header: 'Время', align: 'center', weight: 76 },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Транзакции' });
    expect(table).toHaveAttribute('data-variant', 'compact');
    expect(table.style.getPropertyValue('--ui-card-columns-template')).toBe(
      'minmax(0, 125fr) minmax(0, 76fr)',
    );
    const head = table.querySelector<HTMLElement>('.ui-card-columns__head');
    const [nameColumn, timeColumn] = columnsOf(table);
    expect(
      within(head!)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['ФИО ученика', 'Время']);
    expect(within(nameColumn!).queryByRole('columnheader')).not.toBeInTheDocument();
    expect(
      within(timeColumn!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['17:00-18:30', '19:00-20:30']);
  });

  it('showHeader={false}: заголовки только для скринридера, строка сетки под них не нужна', () => {
    const columns = [
      { key: 'name', header: 'Название' },
      { key: 'time', header: 'Время' },
    ];
    const { rerender } = render(
      <CardColumns aria-label="Сегодня" columns={columns} rows={rows} showHeader={false} />,
    );
    const table = screen.getByRole('table', { name: 'Сегодня' });
    expect(table).toHaveAttribute('data-header', 'hidden');
    expect(table.style.getPropertyValue('--ui-card-columns-rows')).toBe('2');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    headers.forEach((header) => expect(header).toHaveClass('ui-visually-hidden'));

    rerender(
      <CardColumns
        aria-label="Сегодня"
        variant="compact"
        columns={columns}
        rows={rows}
        showHeader={false}
      />,
    );
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    // Обёртка заголовков compact — первая после (отсутствующей) подписи.
    expect(table.firstElementChild).toHaveClass('ui-visually-hidden');
    expect(table.firstElementChild).toHaveAttribute('role', 'none');
  });

  it('caption — подпись блока (role="caption") первой в таблице', () => {
    render(
      <CardColumns
        aria-label="Транзакции за вчера"
        caption="вчера"
        variant="compact"
        columns={[{ key: 'name', header: 'Название' }]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Транзакции за вчера' });
    const caption = table.firstElementChild!;
    expect(caption).toHaveAttribute('role', 'caption');
    expect(caption).toHaveTextContent('вчера');
  });

  it('fit: потолок 45% — только рядом с «резиновой» колонкой, рядом с nowrap — по содержимому', () => {
    const { rerender } = render(
      <CardColumns
        aria-label="Расписание"
        columns={[
          { key: 'name', header: 'Название', fit: true },
          { key: 'group', header: 'Группа', nowrap: true },
          { key: 'time', header: 'Время', nowrap: true },
        ]}
        rows={rows}
      />,
    );
    const table = screen.getByRole('table', { name: 'Расписание' });
    expect(table).toHaveAttribute('data-variant', 'default');
    expect(table.style.getPropertyValue('--ui-card-columns-template')).toBe('auto auto auto');

    rerender(
      <CardColumns
        aria-label="Расписание"
        columns={[
          { key: 'name', header: 'Название', fit: true },
          { key: 'group', header: 'Группа' },
          { key: 'time', header: 'Время', nowrap: true },
        ]}
        rows={rows}
      />,
    );
    expect(table.style.getPropertyValue('--ui-card-columns-template')).toBe(
      'fit-content(45%) minmax(0, 1fr) auto',
    );
  });
});
