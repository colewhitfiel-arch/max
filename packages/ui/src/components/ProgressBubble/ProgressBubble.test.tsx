import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBubble, ProgressBubbleGroup } from './ProgressBubble';

describe('ProgressBubble', () => {
  it('с aria-label — одна картинка, содержимое скрыто; размер в переменной', () => {
    render(
      <ProgressBubble
        size={150}
        title="Шахматы"
        image="chess.png"
        value={28}
        suffix="/45*"
        aria-label="Шахматы: 28 из 45"
      />,
    );
    const bubble = screen.getByRole('img', { name: 'Шахматы: 28 из 45' });
    expect(bubble).toHaveStyle({ '--ui-progress-bubble-size': '150px' });
    expect(within(bubble).getByText('Шахматы')).toHaveAttribute('aria-hidden', 'true');
  });

  it('без aria-label текст читается как есть', () => {
    render(<ProgressBubble size={120} title="Робототехника" value={100} suffix="/30*" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Робототехника')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByText('/30*')).toBeInTheDocument();
  });

  it('группа — список, один круг помечается для центровки', () => {
    const { rerender } = render(
      <ProgressBubbleGroup aria-label="Выполненные задания">
        <ProgressBubble key="a" size={150} title="A" value={1} />
        <ProgressBubble key="b" size={150} title="B" value={2} />
      </ProgressBubbleGroup>,
    );
    const list = screen.getByRole('list', { name: 'Выполненные задания' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).not.toHaveAttribute('data-single');

    rerender(
      <ProgressBubbleGroup aria-label="Выполненные задания">
        <ProgressBubble key="a" size={150} title="A" value={1} />
      </ProgressBubbleGroup>,
    );
    expect(screen.getByRole('list', { name: 'Выполненные задания' })).toHaveAttribute(
      'data-single',
    );
  });
});
