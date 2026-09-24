import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BottomNavigation } from './BottomNavigation';

const items = [
  { key: 'home', label: 'Главная', active: true },
  { key: 'chat', label: 'Чат', badge: 3 },
];

describe('BottomNavigation', () => {
  it('пункты с именами и тултипом, активный — aria-current="page"', async () => {
    const onSelect = vi.fn();
    render(<BottomNavigation items={items} onSelect={onSelect} />);
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument();
    const home = screen.getByRole('button', { name: 'Главная' });
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home).toHaveAttribute('title', 'Главная');
    // С бейджем имя берётся из содержимого — число не теряется.
    const chat = screen.getByRole('button', { name: /Чат/ });
    expect(chat).toHaveTextContent('3');
    expect(chat).not.toHaveAttribute('aria-current');

    await userEvent.click(chat);
    expect(onSelect).toHaveBeenCalledWith('chat', expect.anything());
  });

  it('aria-label={undefined} не затирает имя навигации по умолчанию', () => {
    render(<BottomNavigation items={items} aria-label={undefined} />);
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument();
  });
});
