import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../Input';
import { Field } from './Field';

describe('Field', () => {
  it('label связан с input', () => {
    render(
      <Field label="Имя">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Имя');
    expect(input.tagName).toBe('INPUT');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('error → aria-invalid и aria-describedby указывают на текст ошибки', () => {
    render(
      <Field label="Email" error="Неверный формат" hint="Например, name@mail.ru">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby') ?? '';
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Неверный формат');
    expect(described.split(' ')).toContain(error.id);
    expect(input).toHaveAccessibleDescription('Неверный формат Например, name@mail.ru');
  });

  it('required/disabled передаются контролу', () => {
    render(
      <Field label="Телефон" required disabled>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Телефон/);
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
  });
});
