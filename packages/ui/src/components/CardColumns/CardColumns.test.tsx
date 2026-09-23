import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardColumns } from './CardColumns';

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
    const [nameColumn, timeColumn] = within(table).getAllByRole('rowgroup');
    const button = within(nameColumn!).getByRole('button', { name: 'Добавить кружок' });
    expect(within(timeColumn!).queryByRole('button')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
