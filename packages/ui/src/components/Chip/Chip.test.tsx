import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Chip';

describe('Chip', () => {
  it('без selected — обычная кнопка без aria-pressed', () => {
    render(<Chip>Подсказка</Chip>);
    const chip = screen.getByRole('button', { name: 'Подсказка' });
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(chip).not.toHaveAttribute('data-selected');
  });

  it('selected={false} — переключатель в состоянии «не нажат»', () => {
    render(<Chip selected={false}>Фильтр</Chip>);
    const chip = screen.getByRole('button', { name: 'Фильтр', pressed: false });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).not.toHaveAttribute('data-selected');
  });

  it('selected — aria-pressed="true" и data-selected', () => {
    render(<Chip selected>Фильтр</Chip>);
    const chip = screen.getByRole('button', { name: 'Фильтр', pressed: true });
    expect(chip).toHaveAttribute('data-selected');
  });
});
