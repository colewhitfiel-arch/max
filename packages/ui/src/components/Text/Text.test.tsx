import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('preserveLines → data-preserve-lines (переносы строк из текста сохраняются)', () => {
    render(<Text preserveLines>{'Первая\nвторая'}</Text>);
    expect(screen.getByText(/Первая/)).toHaveAttribute('data-preserve-lines');
  });

  it('без preserveLines атрибута нет', () => {
    render(<Text>Строка</Text>);
    expect(screen.getByText('Строка')).not.toHaveAttribute('data-preserve-lines');
  });
});
