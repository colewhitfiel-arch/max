import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, getInitials } from './Avatar';

describe('Avatar', () => {
  it('инициалы — первые буквы двух первых слов', () => {
    expect(getInitials('  иванов   егор петрович ')).toBe('ИЕ');
  });

  it('при ошибке загрузки — инициалы; новый src снова показывается', () => {
    const { container, rerender } = render(<Avatar name="Иванов Егор" src="a.png" />);
    expect(screen.getByRole('img', { name: 'Иванов Егор' })).toBeInTheDocument();

    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('ИЕ')).toBeInTheDocument();

    rerender(<Avatar name="Иванов Егор" src="b.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'b.png');
  });
});
