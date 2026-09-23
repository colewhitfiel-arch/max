import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Band } from './Band';

describe('Band', () => {
  it('по умолчанию — полоса на всю ширину без тона и без снятого отступа', () => {
    render(
      <Band as="section" aria-label="Задание 9">
        текст
      </Band>,
    );
    const band = screen.getByRole('region', { name: 'Задание 9' });
    expect(band).toHaveClass('ui-band');
    expect(band).toHaveAttribute('data-bleed');
    expect(band).not.toHaveAttribute('data-tone');
    expect(band).not.toHaveAttribute('data-flush');
  });

  it('subtle и flush — полоса курса вплотную под шапкой; bleed можно выключить', () => {
    render(
      <Band tone="subtle" flush bleed={false} data-testid="course">
        Робототехника
      </Band>,
    );
    const band = screen.getByTestId('course');
    expect(band).toHaveAttribute('data-tone', 'subtle');
    expect(band).toHaveAttribute('data-flush');
    expect(band).not.toHaveAttribute('data-bleed');
  });
});
