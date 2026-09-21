import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer, type ChatComposerProps } from './ChatComposer';

function Harness(props: Partial<ChatComposerProps>) {
  const [value, setValue] = useState('');
  return (
    <ChatComposer
      value={value}
      onChange={setValue}
      onSubmit={() => {}}
      placeholder="Напиши вопрос…"
      {...props}
    />
  );
}

describe('ChatComposer', () => {
  it('не отправляет пустой текст и отправляет по Enter без Shift', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const send = screen.getByRole('button', { name: 'Отправить' });
    expect(send).toBeDisabled();

    const input = screen.getByRole('textbox', { name: 'Напиши вопрос…' });
    await user.type(input, 'первая{Shift>}{Enter}{/Shift}вторая');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue('первая\nвторая');
    expect(send).toBeEnabled();

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('первая\nвторая');
  });

  it('в состоянии busy показывает «Стоп» вместо отправки', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<Harness busy onStop={onStop} />);
    expect(screen.queryByRole('button', { name: 'Отправить' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Остановить' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
