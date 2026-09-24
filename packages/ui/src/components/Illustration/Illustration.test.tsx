import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Illustration } from './Illustration';

describe('Illustration', () => {
  it('по умолчанию декоративная: пустой alt и aria-hidden', () => {
    const { container } = render(<Illustration src="/tutor.webp" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/tutor.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img.style.getPropertyValue('--ui-illustration-ratio')).toBe('');
  });

  it('с alt — содержательная картинка, ratio задаёт пропорции', () => {
    render(<Illustration src="/tutor.webp" alt="Репетитор у доски" ratio="4 / 3" />);
    const img = screen.getByRole('img', { name: 'Репетитор у доски' });
    expect(img).not.toHaveAttribute('aria-hidden');
    expect(img.style.getPropertyValue('--ui-illustration-ratio')).toBe('4 / 3');
  });
});
