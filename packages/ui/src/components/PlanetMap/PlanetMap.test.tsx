import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanetMap } from './PlanetMap';

const items = [
  { key: 'a', image: 'a.png', value: 120, label: 'английский' },
  { key: 'b', image: 'b.png', value: 150, label: 'робототехника', marker: 'сделать до завтра' },
];

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: String(i),
    image: 'p.png',
    value: i,
    label: `кружок ${i}`,
  }));

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

  it('видны четыре планеты, пятая — краешком без подписи; стрелки листают', async () => {
    const onOffsetChange = vi.fn();
    render(<PlanetMap items={many(6)} aria-label="Карта" onOffsetChange={onOffsetChange} />);
    const list = screen.getByRole('list', { name: 'Карта' });
    expect(within(list).getAllByRole('img')).toHaveLength(4);
    expect(screen.getByText('кружок 3')).toBeInTheDocument();
    expect(screen.queryByText('кружок 4')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.ui-planet-map__item[data-edge]')).toHaveLength(1);

    list.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onOffsetChange).toHaveBeenLastCalledWith(1);
    expect(screen.queryByText('кружок 0')).not.toBeInTheDocument();
    expect(screen.getByText('кружок 4')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    // Дальше последней позиции не уходим: 6 планет → максимум 2.
    expect(onOffsetChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByText('кружок 5')).toBeInTheDocument();
  });

  it('заблокированная планета серая, с замком и не кликается', () => {
    const onClick = vi.fn();
    render(
      <PlanetMap
        items={[{ key: 'x', image: 'x.png', label: 'Математика', locked: true, onClick }]}
      />,
    );
    const planet = screen.getByRole('img', { name: 'Математика' });
    expect(planet).toHaveAttribute('data-locked');
    expect(planet.querySelector('.ui-planet-map__lock')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
