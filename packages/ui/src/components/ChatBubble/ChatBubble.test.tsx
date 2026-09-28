import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('без текста в стриме показывает индикатор набора и aria-busy', () => {
    const { container } = render(<ChatBubble streaming typingLabel="Тьютор печатает…" />);
    expect(screen.getByRole('status', { name: 'Тьютор печатает…' })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('рендерит текст, подпись и сторону автора', () => {
    render(
      <ChatBubble side="end" meta="12:30">
        Привет
      </ChatBubble>,
    );
    expect(screen.getByText('Привет')).toBeInTheDocument();
    expect(screen.getByText('12:30')).toBeInTheDocument();
    expect(screen.getByText('Привет').closest('.ui-chat-bubble')).toHaveAttribute(
      'data-side',
      'end',
    );
  });

  it('appear — плавное появление только по запросу', () => {
    const { container, rerender } = render(<ChatBubble appear>Новое</ChatBubble>);
    expect(container.firstElementChild).toHaveAttribute('data-appear', 'true');
    rerender(<ChatBubble>Из истории</ChatBubble>);
    expect(container.firstElementChild).not.toHaveAttribute('data-appear');
  });
});
