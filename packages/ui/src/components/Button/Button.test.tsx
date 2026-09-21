import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('по умолчанию type="button"', () => {
    render(<Button>Ок</Button>);
    expect(screen.getByRole('button', { name: 'Ок' })).toHaveAttribute('type', 'button');
  });

  it('loading → aria-busy и disabled, клик не срабатывает', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Сохранить' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('прокидывает data-атрибуты варианта и размера', () => {
    render(
      <Button variant="danger" size="sm">
        Удалить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Удалить' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    expect(button).toHaveAttribute('data-size', 'sm');
  });
});
