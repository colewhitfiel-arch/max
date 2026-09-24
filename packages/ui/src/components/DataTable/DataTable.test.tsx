import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

const columns = [
  { key: 'group', header: 'Группа', weight: 1 },
  {
    key: 'correct',
    header: 'Правильно выполненные дз',
    align: 'center' as const,
    weight: 2,
    tone: 'success' as const,
  },
  {
    key: 'done',
    header: 'Выполненные дз',
    align: 'center' as const,
    weight: 1,
    tone: 'primary' as const,
  },
];

describe('DataTable', () => {
  it('настоящая таблица: подпись, заголовки колонок, ячейки, доли ширины и тона', () => {
    const { container } = render(
      <DataTable
        caption="Домашние задания по группам"
        columns={columns}
        rows={[
          { key: 'g1', cells: { group: '001', correct: 30, done: 50 } },
          { key: 'g2', cells: { group: '012', correct: 12, done: 20 } },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Домашние задания по группам' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Группа', 'Правильно выполненные дз', 'Выполненные дз']);
    const [, firstRow] = within(table).getAllByRole('row');
    const cells = within(firstRow!).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual(['001', '30', '50']);
    expect(cells[1]).toHaveAttribute('data-tone', 'success');
    expect(cells[1]).toHaveAttribute('data-align', 'center');
    expect(cells[0]).not.toHaveAttribute('data-tone');
    const widths = [...container.querySelectorAll('col')].map((col) => col.style.width);
    expect(widths).toEqual(['25%', '50%', '25%']);
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  it('строка с onClick: кнопка в первой ячейке (Enter/Space) и клик по любому месту строки', async () => {
    const onClick = vi.fn();
    render(
      <DataTable
        aria-label="Успеваемость групп"
        columns={columns}
        rows={[
          {
            key: 'g1',
            cells: { group: '001', correct: 30, done: 50 },
            onClick,
            'aria-label': 'Группа 001: ученики',
          },
          { key: 'g2', cells: { group: '012', correct: 12, done: 20 } },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Успеваемость групп' });
    const button = within(table).getByRole('button', { name: 'Группа 001: ученики' });
    expect(within(table).getAllByRole('button')).toHaveLength(1);

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    await userEvent.click(within(table).getByText('50'));
    expect(onClick).toHaveBeenCalledTimes(2);

    button.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(4);

    // Некликабельная строка ничего не вызывает.
    await userEvent.click(within(table).getByText('012'));
    expect(onClick).toHaveBeenCalledTimes(4);
  });
});
