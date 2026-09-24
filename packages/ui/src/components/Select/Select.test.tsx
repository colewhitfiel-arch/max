import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Первая' },
  { value: 'b', label: 'Вторая' },
];

describe('Select', () => {
  it('uncontrolled с placeholder: изначально выбран плейсхолдер', () => {
    render(<Select aria-label="Группа" options={options} placeholder="Выбери группу" />);
    expect(screen.getByRole('combobox', { name: 'Группа' })).toHaveValue('');
  });

  it('явный defaultValue и controlled value имеют приоритет над плейсхолдером', () => {
    const { rerender } = render(
      <Select aria-label="Группа" options={options} placeholder="Выбери" defaultValue="b" />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('b');
    rerender(
      <Select
        key="controlled"
        aria-label="Группа"
        options={options}
        placeholder="Выбери"
        value="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('a');
  });

  it('без placeholder браузер выбирает первую опцию', () => {
    render(<Select aria-label="Группа" options={options} />);
    expect(screen.getByRole('combobox')).toHaveValue('a');
  });
});
