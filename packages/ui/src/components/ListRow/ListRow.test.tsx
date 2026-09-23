import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListRow } from './ListRow';

describe('ListRow', () => {
  it('с onClick — кнопка: Enter и Space нажимают строку', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ListRow title="Профиль" onClick={onClick} />);
    const row = screen.getByRole('button', { name: 'Профиль' });

    row.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('disabled — не нажимается и не в порядке табуляции', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ListRow title="Профиль" disabled onClick={onClick} />);
    const row = screen.getByRole('button', { name: 'Профиль' });

    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).not.toHaveAttribute('tabindex');
    await user.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('клавиши во вложенном поле не нажимают строку и не глушат ввод', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ListRow title="Заметка" right={<input aria-label="Текст" />} onClick={onClick} />);
    const input = screen.getByRole('textbox', { name: 'Текст' });

    await user.click(input);
    onClick.mockClear();
    await user.keyboard('а б{Enter}');
    expect(input).toHaveValue('а б');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter на вложенной кнопке с stopPropagation — только её действие', async () => {
    const user = userEvent.setup();
    const onRow = vi.fn();
    const onButton = vi.fn();
    render(
      <ListRow
        title="Уведомление"
        right={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onButton();
            }}
          >
            Прочитано
          </button>
        }
        onClick={onRow}
      />,
    );
    screen.getByRole('button', { name: 'Прочитано' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onButton).toHaveBeenCalledTimes(2);
    expect(onRow).not.toHaveBeenCalled();
  });
});
