import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('кнопка «Назад» по умолчанию и с backLabel (i18n)', async () => {
    const onBack = vi.fn();
    const { rerender } = render(<PageHeader title="Главная" onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(<PageHeader title="Home" onBack={onBack} backLabel="Back" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
