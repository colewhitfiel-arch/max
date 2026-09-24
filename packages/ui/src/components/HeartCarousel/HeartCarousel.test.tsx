import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HeartCarousel, type HeartCarouselItem } from './HeartCarousel';

// В jsdom нет PointerEvent: без него fireEvent теряет pointerType/pointerId.
beforeAll(() => {
  if (typeof window.PointerEvent === 'function') return;
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
});

const children: HeartCarouselItem[] = [
  { key: 'a', name: 'Иванов Егор', label: 'Иванов Е. А', src: 'a.png' },
  { key: 'b', name: 'Петрова Анна', label: 'Петрова А. С' },
  { key: 'c', name: 'Сидоров Олег', label: 'Сидоров О. И' },
];

function Controlled({
  items = children,
  initial = 'a',
  onChange,
  onAdd = () => undefined,
}: {
  items?: HeartCarouselItem[];
  initial?: string | null;
  onChange?: (key: string) => void;
  onAdd?: () => void;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <HeartCarousel
      aria-label="Дети"
      items={items}
      value={value}
      onChange={(key) => {
        setValue(key);
        onChange?.(key);
      }}
      onAdd={onAdd}
      addLabel="Добавить ребёнка"
    />
  );
}

describe('HeartCarousel', () => {
  it('дети — варианты listbox, выбранный отмечен; «+» — отдельная кнопка', () => {
    render(<Controlled initial="b" />);
    const list = screen.getByRole('listbox', { name: 'Дети' });
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Петрова А. С' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Иванов Е. А' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // Roving tabindex: в Tab-порядке только выбранный.
    expect(options.map((option) => option.tabIndex)).toEqual([-1, 0, -1]);
    const add = screen.getByRole('button', { name: 'Добавить ребёнка' });
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(add).toBeInTheDocument();
  });

  it('тап по соседнему сердцу выбирает его', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('option', { name: 'Сидоров О. И' }));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('option', { name: 'Сидоров О. И' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('тап по уже выбранному не вызывает onChange', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('option', { name: 'Иванов Е. А' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('←/→/Home/End меняют выбор и переносят фокус, без зацикливания', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    screen.getByRole('option', { name: 'Иванов Е. А' }).focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByRole('option', { name: 'Петрова А. С' })).toHaveFocus();

    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(screen.getByRole('option', { name: 'Сидоров О. И' })).toHaveFocus();

    onChange.mockClear();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'Сидоров О. И' })).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('«+» вызывает onAdd и не меняет выбор', async () => {
    const onChange = vi.fn();
    const onAdd = vi.fn();
    render(<Controlled onChange={onChange} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: 'Добавить ребёнка' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('без детей — только «+», без пустого listbox', async () => {
    const onAdd = vi.fn();
    render(<Controlled items={[]} initial={null} onAdd={onAdd} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить ребёнка' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('без выбранного в Tab-порядке первый ребёнок', () => {
    render(<Controlled initial={null} />);
    expect(screen.getByRole('option', { name: 'Иванов Е. А' })).toHaveAttribute('tabindex', '0');
    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0);
  });

  it('клик после перетаскивания мышью не выбирает сердце', () => {
    const onChange = vi.fn();
    const { container } = render(<Controlled onChange={onChange} />);
    const viewport = container.querySelector('.ui-heart-carousel__viewport')!;
    const target = screen.getByRole('option', { name: 'Петрова А. С' });
    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 200,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
      clientX: 120,
    });
    expect(viewport).toHaveAttribute('data-dragging');
    fireEvent.pointerUp(viewport, { pointerId: 1, pointerType: 'mouse', clientX: 120 });
    fireEvent.click(target);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('кнопку мыши отпустили за лентой — наведение потом не тащит ленту', () => {
    const onChange = vi.fn();
    const { container } = render(<Controlled onChange={onChange} />);
    const viewport = container.querySelector('.ui-heart-carousel__viewport')!;
    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 200,
    });
    // pointerup ушёл мимо ленты; дальше мышь просто водят над ней без нажатой кнопки.
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
      clientX: 120,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
      clientX: 60,
    });
    expect(viewport).not.toHaveAttribute('data-dragging');
    // Следующий клик — обычный выбор, не «клик после перетаскивания».
    fireEvent.click(screen.getByRole('option', { name: 'Петрова А. С' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('фокус докатывает пункт в центр только после Tab, не после тапа или возврата фокуса', () => {
    // Раскладка: лента 360px, слот 180px, первое сердце по центру.
    const width = 360;
    const layout = [
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(width),
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width / 2),
      vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function offsetLeft(
        this: HTMLElement,
      ) {
        const nodes = [...document.querySelectorAll('.ui-heart-carousel__item')];
        return width / 4 + nodes.indexOf(this) * (width / 2);
      }),
    ];
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
    try {
      render(<Controlled />);
      const add = screen.getByRole('button', { name: 'Добавить ребёнка' });
      scrollTo.mockClear();

      // Тап по «+» (фокус на тач-экране приходит после клика) и возврат фокуса шторкой.
      fireEvent.pointerDown(document.body, { pointerType: 'touch' });
      add.focus();
      add.blur();
      add.focus();
      expect(scrollTo).not.toHaveBeenCalled();

      // Tab до «+» — лента докатывает его в центр.
      add.blur();
      fireEvent.keyDown(document.body, { key: 'Tab' });
      add.focus();
      expect(scrollTo).toHaveBeenCalledWith({ left: 540, behavior: 'smooth' });
    } finally {
      layout.forEach((spy) => spy.mockRestore());
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });

  it('сердца декоративные: фото скрыто от скринридеров, лента на всю ширину по умолчанию', () => {
    const { container } = render(<Controlled />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-bleed');
  });
});
