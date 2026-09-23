import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusGrid, type StatusGridItem } from './StatusGrid';

const TONES = ['success', 'danger', 'warning', 'neutral'] as const;
const STATUS = { success: 'выполнено', danger: 'неправильно', warning: 'скоро', neutral: 'позже' };

const items: StatusGridItem[] = Array.from({ length: 10 }, (_, index) => {
  const tone = TONES[index % TONES.length] ?? 'neutral';
  return {
    key: `task-${index + 1}`,
    label: String(index + 1),
    tone,
    title: `Задание ${index + 1} — ${STATUS[tone]}`,
  };
});

describe('StatusGrid', () => {
  it('ячейки — кнопки с полным описанием, нажатие вызывает onSelect с ключом', async () => {
    const onSelect = vi.fn();
    render(<StatusGrid aria-label="Задания" items={items} onSelect={onSelect} />);
    expect(screen.getByRole('list', { name: 'Задания' })).toBeInTheDocument();
    const cell = screen.getByRole('button', { name: 'Задание 2 — неправильно' });
    expect(cell).toHaveTextContent('2');
    expect(cell).toHaveAttribute('data-tone', 'danger');
    await userEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith('task-2');
  });

  it('одна точка табуляции, стрелки ходят по сетке, Enter выбирает', async () => {
    const onSelect = vi.fn();
    render(<StatusGrid aria-label="Задания" items={items} columns={7} onSelect={onSelect} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Задание 1 — выполнено' })).toHaveFocus();
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0)).toHaveLength(1);

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Задание 2 / })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^Задание 9 / })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('button', { name: /^Задание 10 / })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('task-10');
  });

  it('без onSelect — не кнопки, описание доступно скринридеру', () => {
    render(<StatusGrid aria-label="Задания" items={items.slice(0, 3)} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Задание 3 — скоро')).toBeInTheDocument();
  });
});
