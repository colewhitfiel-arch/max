import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MonthCalendar } from './MonthCalendar';

const today = new Date(2026, 8, 22); // вт, 22 сентября 2026

function Controlled({ onSelect = vi.fn() }: { onSelect?: (date: Date) => void }) {
  const [month, setMonth] = useState(new Date(2026, 8, 1));
  const [selected, setSelected] = useState<Date>(today);
  return (
    <MonthCalendar
      month={month}
      onMonthChange={setMonth}
      selected={selected}
      onSelect={(date) => {
        setSelected(date);
        onSelect(date);
      }}
      today={today}
      isMarked={(date) => date.getDate() === 23}
      describeDay={(date) => (date.getDate() === 23 ? 'есть занятия' : undefined)}
    />
  );
}

describe('MonthCalendar', () => {
  it('рисует месяц с понедельника: выбранный день, сегодня и отметки', () => {
    render(<Controlled />);
    expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('пн');
    const selected = screen.getByRole('button', { name: /22 сентября/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveAttribute('aria-current', 'date');
    expect(selected).toHaveAttribute('tabindex', '0');
    const marked = screen.getByRole('button', { name: /23 сентября, есть занятия/ });
    expect(marked).toHaveAttribute('data-marked', 'true');
    // 1 сентября 2026 — вторник: одна пустая клетка перед ним.
    expect(screen.getAllByRole('gridcell')[0]).toBeEmptyDOMElement();
  });

  it('выбирает день кликом и листает месяцы кнопками', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Controlled onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /25 сентября/ }));
    expect(onSelect).toHaveBeenCalledWith(new Date(2026, 8, 25));
    expect(screen.getByRole('button', { name: /25 сентября/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    expect(screen.getByText('Октябрь 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
    await user.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
    expect(screen.getByText('Август 2026')).toBeInTheDocument();
  });

  it('стрелки двигают фокус по дням и переходят в соседний месяц', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    screen.getByRole('button', { name: /22 сентября/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /29 сентября/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByText('Октябрь 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'вторник, 6 октября' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'вторник, 6 октября' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
