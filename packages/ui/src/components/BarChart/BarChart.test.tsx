import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';

const bars = [
  {
    key: 'g1',
    label: '001',
    tone: 'primary' as const,
    segments: [
      { key: 'attended', value: 15 },
      { key: 'missed', value: 4, dim: true },
    ],
  },
  {
    key: 'g2',
    label: '003',
    tone: 'success' as const,
    segments: [
      { key: 'attended', value: 12 },
      { key: 'missed', value: 3, dim: true },
    ],
  },
];

const legend = [
  {
    key: 'robotics',
    title: 'Робототехника',
    tone: 'primary' as const,
    items: [{ label: 'посетили' }, { label: 'пропустили', dim: true }],
  },
  {
    key: 'chinese',
    title: 'Китайский',
    tone: 'success' as const,
    items: [{ label: 'посетили' }, { label: 'пропустили', dim: true }],
  },
];

describe('BarChart', () => {
  it('диаграмма — role="img" с названием, легенда по курсам — списки', () => {
    render(
      <BarChart
        title="Посещения"
        aria-label="Группа 001: посетили 15, пропустили 4; группа 003: посетили 12, пропустили 3"
        bars={bars}
        legend={legend}
      />,
    );
    expect(screen.getByText('Посещения')).toBeInTheDocument();
    const figure = screen.getByRole('img', { name: /^Группа 001: посетили 15/ });
    expect(figure.querySelectorAll('.ui-bar-chart__bar')).toHaveLength(2);
    // Число столбцов задаёт минимальную ширину области: при многих группах она прокручивается,
    // а не наезжает на легенду.
    expect(
      figure
        .querySelector<HTMLElement>('.ui-bar-chart__plot')!
        .style.getPropertyValue('--ui-bar-chart-count'),
    ).toBe('2');

    const [outer] = screen.getAllByRole('list');
    const groups = within(outer!)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === outer);
    expect(groups.map((group) => group.getAttribute('data-tone'))).toEqual(['primary', 'success']);
    expect(within(groups[0]!).getByText('Робототехника')).toBeInTheDocument();
    const swatches = groups[0]!.querySelectorAll('.ui-bar-chart__swatch');
    expect(swatches[0]).not.toHaveAttribute('data-dim');
    expect(swatches[1]).toHaveAttribute('data-dim');
  });

  it('части столбца — от основания до своей границы, итог по умолчанию — сумма', () => {
    const { container } = render(<BarChart aria-label="Посещения" bars={bars} />);
    const [first] = container.querySelectorAll('.ui-bar-chart__bar');
    // Авто-деления: максимум 19 → 0 / 10 / 20.
    expect(
      [...container.querySelectorAll('.ui-bar-chart__tick-label')].map((l) => l.textContent),
    ).toEqual(['0', '10', '20']);
    const segments = [...first!.querySelectorAll<HTMLElement>('.ui-bar-chart__segment')];
    // Верхняя (приглушённая) рисуется первой, нижняя — поверх неё.
    expect(segments.map((s) => s.style.getPropertyValue('--ui-bar-chart-h'))).toEqual([
      '95%',
      '75%',
    ]);
    expect(segments[0]).toHaveAttribute('data-dim');
    expect(first!.querySelector('.ui-bar-chart__total')).toHaveTextContent('19');
    expect(first!.querySelector('.ui-bar-chart__label')).toHaveTextContent('001');
  });

  it('нулевой столбец пустой, но с подписью; свои деления и итог', () => {
    const { container } = render(
      <BarChart
        aria-label="Посещения"
        yTicks={[0, 25, 50]}
        bars={[
          { key: 'g1', label: '007', tone: 'info', segments: [{ key: 'a', value: 0 }] },
          {
            key: 'g2',
            label: '005',
            tone: 'danger',
            total: '10 из 12',
            segments: [{ key: 'a', value: 10 }],
          },
        ]}
      />,
    );
    const [empty, full] = container.querySelectorAll('.ui-bar-chart__bar');
    expect(empty).toHaveAttribute('data-empty');
    expect(empty!.querySelectorAll('.ui-bar-chart__segment')).toHaveLength(0);
    expect(empty!.querySelector('.ui-bar-chart__label')).toHaveTextContent('007');
    expect(empty!.querySelector('.ui-bar-chart__total')).toHaveTextContent('0');
    expect(full!.querySelector('.ui-bar-chart__total')).toHaveTextContent('10 из 12');
    expect(
      full!
        .querySelector<HTMLElement>('.ui-bar-chart__segment')!
        .style.getPropertyValue('--ui-bar-chart-h'),
    ).toBe('20%');
    expect(
      [...container.querySelectorAll('.ui-bar-chart__tick-label')].map((l) => l.textContent),
    ).toEqual(['0', '25', '50']);
  });

  it('длинные подписи (названия групп) раздвигают столбцы на равные доли; коды — нет', () => {
    const named = bars.map((bar, index) => ({
      ...bar,
      label: ['Робототехника, группа А', 'Python, группа А'][index],
    }));
    const { container, rerender } = render(<BarChart aria-label="Посещения" bars={named} />);
    const figure = () => container.querySelector('.ui-bar-chart__figure');
    expect(figure()).toHaveAttribute('data-spread');
    expect(
      [...container.querySelectorAll('.ui-bar-chart__label')].map((label) => label.textContent),
    ).toEqual(['Робототехника, группа А', 'Python, группа А']);

    rerender(<BarChart aria-label="Посещения" bars={bars} />);
    expect(figure()).not.toHaveAttribute('data-spread');
  });
});
