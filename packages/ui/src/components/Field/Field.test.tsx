import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from '../Checkbox';
import { Input } from '../Input';
import { Switch } from '../Switch';
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

  describe('group — несколько контролов под одной подписью', () => {
    it('role="group" с именем из подписи, hint/error — описание группы', () => {
      render(
        <Field group label="Роли" required error="Нужна хотя бы одна роль" hint="Можно несколько">
          <Checkbox label="Ученик" />
          <Checkbox label="Родитель" />
          <Switch label="Уведомления" />
        </Field>,
      );
      const group = screen.getByRole('group', { name: 'Роли' });
      expect(group).toHaveAccessibleDescription('Нужна хотя бы одна роль Можно несколько');
      // Подпись группы — не <label>: она не указывает ни на один контрол.
      expect(within(group).getByText('Роли').tagName).toBe('DIV');
      expect(group.querySelector('label[for]')).toBeNull();
    });

    it('у каждого контрола свой id и своё имя; required группы не ставится контролам', () => {
      render(
        <Field group label="Роли" required>
          <Checkbox label="Ученик" />
          <Checkbox label="Родитель" />
          <Switch label="Уведомления" />
        </Field>,
      );
      const controls = [
        screen.getByRole('checkbox', { name: 'Ученик' }),
        screen.getByRole('checkbox', { name: 'Родитель' }),
        screen.getByRole('switch', { name: 'Уведомления' }),
      ];
      const ids = controls.map((control) => control.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(controls.length);
      for (const control of controls) {
        expect(control).not.toBeRequired();
        expect(control).not.toHaveAttribute('aria-invalid');
      }
    });

    it('disabled группы передаётся всем контролам', () => {
      render(
        <Field group label="Роли" disabled>
          <Checkbox label="Ученик" />
          <Checkbox label="Родитель" />
        </Field>,
      );
      for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
    });
  });
});
