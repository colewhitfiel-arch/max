import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineChart } from './LineChart';

const hours = ['4:00', '8:00', '12:00', '16:00', '20:00', '00:00'];
const balance = [2700, 2700, 7200, 7200, 7200, 6700].map((value, index) => ({
  key: hours[index]!,
  value,
}));

const pathOf = (container: HTMLElement) =>
  container.querySelector('.ui-line-chart__line')!.getAttribute('d')!;

describe('LineChart', () => {
  it('график — role="img" с названием; заголовок и подписи осей видны', () => {
    render(
      <LineChart
        title="Изменение баланса"
        aria-label="Баланс за день: с 2 700 до 6 700 ₽"
        points={balance}
        xLabels={hours}
        step
      />,
    );
    const figure = screen.getByRole('img', { name: 'Баланс за день: с 2 700 до 6 700 ₽' });
    expect(screen.getByText('Изменение баланса')).toBeInTheDocument();
    // Авто-деления: 0, середина и «круглый» верх над максимумом 7200.
    expect(
      [...figure.querySelectorAll('.ui-line-chart__tick-label')].map((l) => l.textContent),
    ).toEqual(['0', '5000', '10000']);
    expect(
      [...figure.querySelectorAll('.ui-line-chart__x-label')].map((l) => l.textContent),
    ).toEqual(hours);
    expect(figure.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('линия проходит через все точки: ступенька — пара H/V на точку, иначе — L', () => {
    const { container, rerender } = render(<LineChart aria-label="Баланс" points={balance} step />);
    const stepped = pathOf(container);
    expect(stepped.startsWith('M0 ')).toBe(true);
    expect(stepped.match(/H/g)).toHaveLength(balance.length - 1);
    expect(stepped.match(/V/g)).toHaveLength(balance.length - 1);

    rerender(<LineChart aria-label="Баланс" points={balance} />);
    const straight = pathOf(container);
    expect(straight.match(/[ML]/g)).toHaveLength(balance.length);
    // Последняя точка — у правого края области.
    expect(straight).toMatch(/L100 [\d.]+$/);
  });

  it('свои деления и форматирование; пусто или одна точка — ровная линия', () => {
    const { container, rerender } = render(
      <LineChart
        aria-label="Баланс"
        points={[]}
        yTicks={[0, 5000, 10000]}
        formatTick={(value) => `${value / 1000}k`}
      />,
    );
    expect(
      [...container.querySelectorAll('.ui-line-chart__tick-label')].map((l) => l.textContent),
    ).toEqual(['0k', '5k', '10k']);
    expect(pathOf(container)).toBe('M0 100H100');

    rerender(
      <LineChart aria-label="Баланс" points={[{ key: 'a', value: 5000 }]} yTicks={[0, 10000]} />,
    );
    expect(pathOf(container)).toBe('M0 50H100');
  });

  it('авто-деления при малых значениях целые, все нули — одно деление «0»', () => {
    const labels = (container: HTMLElement) =>
      [...container.querySelectorAll('.ui-line-chart__tick-label')].map((l) => l.textContent);
    const series = (...values: number[]) =>
      values.map((value, index) => ({ key: String(index), value }));
    const { container, rerender } = render(
      <LineChart aria-label="Баланс" points={series(0, 0.5, 1)} />,
    );
    expect(labels(container)).toEqual(['0', '1', '2']);
    rerender(<LineChart aria-label="Баланс" points={series(0, 5)} />);
    expect(labels(container)).toEqual(['0', '5', '10']);
    rerender(<LineChart aria-label="Баланс" points={series(0, 0, 0)} />);
    expect(labels(container)).toEqual(['0']);
  });

  it('высота карточки задаётся пропом, по умолчанию 111px', () => {
    const { container, rerender } = render(<LineChart aria-label="Баланс" points={balance} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--ui-line-chart-height')).toBe('111px');
    rerender(<LineChart aria-label="Баланс" points={balance} height={160} />);
    expect(root.style.getPropertyValue('--ui-line-chart-height')).toBe('160px');
  });
});
