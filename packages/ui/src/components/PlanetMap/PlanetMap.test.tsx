import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanetMap } from './PlanetMap';

const items = [
  { key: 'a', image: 'a.png', value: 120, label: 'английский' },
  { key: 'b', image: 'b.png', value: 150, label: 'робототехника', marker: 'сделать до завтра' },
];

describe('PlanetMap', () => {
  it('отдаёт планеты списком с подписями, линии — декоративные', () => {
    const { container } = render(<PlanetMap items={items} aria-label="Карта" />);
    const list = screen.getByRole('list', { name: 'Карта' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'английский' })).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('сделать до завтра')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(container.querySelector('.ui-planet-map__lines')).toHaveAttribute('aria-hidden', 'true');
  });

  it('планета с onClick — кнопка с доступным названием', async () => {
    const onClick = vi.fn();
    render(
      <PlanetMap
        items={[{ ...items[0]!, title: 'Английский: 120 баллов', onClick }]}
        backdrop="stars.png"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Английский: 120 баллов' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ui-planet-map__backdrop')).toHaveStyle({
      backgroundImage: 'url(stars.png)',
    });
  });

  it('пятая планета уходит на следующий виток: карта становится выше', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      key: String(i),
      image: 'p.png',
      value: i,
      label: `кружок ${i}`,
    }));
    const { container } = render(<PlanetMap items={many} />);
    const canvas = container.querySelector<HTMLElement>('.ui-planet-map__canvas')!;
    expect(canvas.style.getPropertyValue('--ui-planet-map-ratio')).toBe('402 / 665');
  });
});
