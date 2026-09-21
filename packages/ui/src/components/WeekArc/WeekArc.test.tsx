import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekArc } from './WeekArc';

const items = [
  { key: 'mon', label: 'пн', tone: 'neutral' as const, title: 'понедельник — нет уроков' },
  { key: 'tue', label: 'вт', tone: 'success' as const, title: 'вторник — посещено' },
  { key: 'wed', label: 'ср', tone: 'info' as const, title: 'среда — сегодня' },
];

describe('WeekArc', () => {
  it('отдаёт дни списком для скринридера и рисует плашку на каждый день', () => {
    const { container } = render(<WeekArc items={items} aria-label="Посещения за неделю" />);
    const list = screen.getByRole('list', { name: 'Посещения за неделю' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['понедельник — нет уроков', 'вторник — посещено', 'среда — сегодня']);
    expect(container.querySelectorAll('.ui-week-arc__chip')).toHaveLength(3);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('показывает легенду с тонами', () => {
    render(
      <WeekArc
        items={items}
        legend={[
          { tone: 'success', label: 'посещено' },
          { tone: 'danger', label: 'пропуск' },
        ]}
      />,
    );
    expect(screen.getByText('посещено')).toBeInTheDocument();
    expect(screen.getByText('пропуск')).toBeInTheDocument();
    expect(document.querySelector('.ui-week-arc__swatch[data-tone="danger"]')).not.toBeNull();
  });
});
