import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IllustrationRow } from './IllustrationRow';

const item = (key: string) => ({ key, src: `/${key}.png` });

describe('IllustrationRow', () => {
  it('размер зависит от числа картинок: одна, две рядом, много', () => {
    const { container, rerender } = render(<IllustrationRow items={[item('robot')]} />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute('data-size', 'one');
    expect(container.querySelectorAll('img')).toHaveLength(1);

    rerender(<IllustrationRow items={[item('robot'), item('chess')]} />);
    expect(root).toHaveAttribute('data-size', 'two');

    rerender(<IllustrationRow items={[item('robot'), item('chess'), item('book')]} />);
    expect(root).toHaveAttribute('data-size', 'many');
    expect(container.querySelectorAll('img')).toHaveLength(3);
  });

  it('приглушённый ряд помечен, картинки по умолчанию декоративные', () => {
    const { container } = render(<IllustrationRow items={[item('robot')]} muted />);
    expect(container.firstElementChild).toHaveAttribute('data-muted', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
});
