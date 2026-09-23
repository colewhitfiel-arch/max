import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentBar } from './SegmentBar';

describe('SegmentBar', () => {
  it('список сегментов с подписями для скринридера, нулевые скрыты', () => {
    render(
      <SegmentBar
        aria-label="Робототехника"
        segments={[
          { key: 'correct', value: 18, tone: 'success', label: 'Правильно' },
          { key: 'upcoming', value: 0, tone: 'warning', label: 'Предстоят' },
          { key: 'wrong', value: 7, tone: 'danger', label: 'Неправильно' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Робототехника' });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Правильно: 18');
    expect(items[1]).toHaveTextContent('Неправильно: 7');
    expect(list).not.toHaveAttribute('data-empty');
  });

  it('все значения нулевые — пустая полоса', () => {
    render(
      <SegmentBar
        aria-label="Шахматы"
        segments={[
          { key: 'correct', value: 0, tone: 'success' },
          { key: 'wrong', value: 0, tone: 'danger' },
        ]}
      />,
    );
    expect(screen.getByRole('list', { name: 'Шахматы' })).toHaveAttribute('data-empty');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
