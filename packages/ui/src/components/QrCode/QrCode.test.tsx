import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrCode } from './QrCode';

describe('QrCode', () => {
  it('картинка с доступным именем; модули — один path в квадратном viewBox с полем тишины', () => {
    render(<QrCode value="https://max.ru/bot?startapp=checkin_abc" label="QR-код занятия" />);
    const image = screen.getByRole('img', { name: 'QR-код занятия' });
    const [, , width, height] = image.getAttribute('viewBox')!.split(' ').map(Number);
    expect(width).toBe(height);
    // Версия 1 — 21 модуль, плюс поле тишины по 4 с каждой стороны.
    expect(width).toBeGreaterThanOrEqual(21 + 8);
    const path = image.querySelector('path')!.getAttribute('d')!;
    expect(path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    // Поле тишины пустое: ни один отрезок не начинается в первых четырёх строках.
    expect(path).not.toMatch(/M\d+ [0-3]h/);
  });

  it('другое значение — другой рисунок; сторона ограничена size', () => {
    const { rerender, container } = render(<QrCode value="один" label="код" size={200} />);
    const first = container.querySelector('path')!.getAttribute('d');
    expect(container.firstElementChild).toHaveStyle({ maxWidth: '200px' });
    rerender(<QrCode value="другой" label="код" size={200} />);
    expect(container.querySelector('path')!.getAttribute('d')).not.toBe(first);
  });
});
