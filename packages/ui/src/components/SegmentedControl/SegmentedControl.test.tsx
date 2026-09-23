import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const periods = [
  { value: '1', label: '1 день' },
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
];

describe('SegmentedControl', () => {
  it('по умолчанию variant="default"', () => {
    render(<SegmentedControl aria-label="Период" options={periods} />);
    expect(screen.getByRole('radiogroup', { name: 'Период' })).toHaveAttribute(
      'data-variant',
      'default',
    );
  });

  it('variant="accent": radiogroup, клик и стрелки меняют значение', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Период"
        variant="accent"
        options={periods}
        value="1"
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Период' });
    expect(group).toHaveAttribute('data-variant', 'accent');
    expect(screen.getByRole('radio', { name: '1 день' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '1 день' })).toHaveAttribute('data-state', 'checked');

    await userEvent.click(screen.getByRole('radio', { name: '30 дней' }));
    expect(onChange).toHaveBeenLastCalledWith('30');

    screen.getByRole('radio', { name: '1 день' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('7');
    expect(screen.getByRole('radio', { name: '7 дней' })).toHaveFocus();
  });
});
