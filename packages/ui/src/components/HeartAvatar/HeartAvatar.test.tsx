import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeartAvatar } from './HeartAvatar';

describe('HeartAvatar', () => {
  it('картинка с именем; без фото и при ошибке загрузки — инициалы', () => {
    const { container, rerender } = render(<HeartAvatar name="Иванов Егор" src="a.png" />);
    const avatar = screen.getByRole('img', { name: 'Иванов Егор' });
    expect(avatar).toHaveAttribute('data-tone', 'primary');
    expect(avatar).toHaveStyle({ '--ui-heart-avatar-size': '112px' });

    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('ИЕ')).toBeInTheDocument();

    // Новое фото после ошибки снова показывается.
    rerender(<HeartAvatar name="Иванов Егор" src="b.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'b.png');
  });

  it('add — плюс вместо фото, тон и размер из пропсов', () => {
    const { container } = render(<HeartAvatar name="Добавить" add tone="plain" size={100} />);
    const avatar = screen.getByRole('img', { name: 'Добавить' });
    expect(avatar).toHaveAttribute('data-add');
    expect(avatar).toHaveAttribute('data-tone', 'plain');
    expect(avatar).toHaveStyle({ '--ui-heart-avatar-size': '100px' });
    expect(container.querySelector('.ui-heart-avatar__plus')).toBeInTheDocument();
    expect(container.querySelector('.ui-heart-avatar__photo')).not.toBeInTheDocument();
  });
});
