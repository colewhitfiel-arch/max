import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PieChart } from './PieChart';

const legend = [
  { tone: 'success' as const, label: 'Правильно' },
  { tone: 'danger' as const, label: 'Неправильно' },
  { tone: 'warning' as const, label: 'Предстоят' },
];

describe('PieChart', () => {
  it('диаграмма — role="img" с названием, легенда — список', () => {
    render(
      <PieChart
        aria-label="Правильно 25, неправильно 30, предстоят 45"
        slices={[
          { key: 'correct', value: 25, tone: 'success', explode: true },
          { key: 'wrong', value: 30, tone: 'danger' },
          { key: 'upcoming', value: 45, tone: 'warning' },
        ]}
        legend={legend}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Правильно 25, неправильно 30, предстоят 45' }),
    ).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Правильно',
      'Неправильно',
      'Предстоят',
    ]);
  });

  it('рисует числа в секторах, пропускает нулевые, выдвигает отмеченный', () => {
    const { container } = render(
      <PieChart
        aria-label="Домашние задачи"
        slices={[
          { key: 'correct', value: 25, tone: 'success', explode: true },
          { key: 'wrong', value: 0, tone: 'danger' },
          { key: 'upcoming', value: 45, tone: 'warning' },
        ]}
      />,
    );
    const slices = container.querySelectorAll('.ui-pie-chart__slice');
    expect(slices).toHaveLength(2);
    expect([...slices].map((slice) => slice.textContent)).toEqual(['25', '45']);
    expect(slices[0]).toHaveAttribute('data-explode');
    expect(slices[1]).not.toHaveAttribute('data-explode');
  });

  it('все значения нулевые — нейтральное кольцо без секторов', () => {
    const { container } = render(
      <PieChart
        aria-label="Нет заданий"
        slices={[
          { key: 'correct', value: 0, tone: 'success' },
          { key: 'wrong', value: 0, tone: 'danger' },
        ]}
      />,
    );
    expect(container.querySelector('.ui-pie-chart')).toHaveAttribute('data-empty');
    expect(container.querySelector('.ui-pie-chart__slice')).toBeNull();
    expect(container.querySelector('.ui-pie-chart__empty')).not.toBeNull();
  });
});
