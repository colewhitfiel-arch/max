import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { UiPlayground } from './index';

describe('UiPlayground', () => {
  it('рендерится без ошибок и открывает Modal/Sheet/Toast', async () => {
    render(<UiPlayground />);
    expect(screen.getByText('UI Playground')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Открыть Modal' }));
    expect(screen.getByRole('dialog', { name: 'Подтверждение' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Открыть Sheet' }));
    expect(screen.getByRole('dialog', { name: 'Выбор действия' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Отметить пропуск' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'success' }));
    expect(screen.getByRole('region', { name: 'Уведомления' })).toHaveTextContent('Тост: success');
  });

  it('переключатель темы ставит data-theme', async () => {
    render(<UiPlayground />);
    await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: 'Светлая' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('режим репетитора: оранжевый акцент и «Вывести» в демо кошелька', async () => {
    render(<UiPlayground />);
    await userEvent.click(screen.getByRole('radio', { name: 'Оранжевый — репетитор' }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('orange');

    const withdraw = screen.getByRole('button', { name: 'Вывести' });
    expect(screen.getByRole('img', { name: 'Баланс 6700 ₽' })).toBeInTheDocument();
    await userEvent.click(withdraw);
    expect(withdraw).toBeDisabled();
    expect(screen.getByRole('img', { name: 'Баланс 0 ₽' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Синий — ученик' }));
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });
});
