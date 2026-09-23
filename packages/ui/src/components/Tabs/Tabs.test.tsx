import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const items = [
  { key: 'a', label: 'Первая' },
  { key: 'b', label: 'Вторая' },
  { key: 'c', label: 'Третья', disabled: true },
];

describe('Tabs', () => {
  it('рендерит tablist/tab/tabpanel и активную вкладку', () => {
    render(<Tabs items={items}>{(key) => <p>Панель {key}</p>}</Tabs>);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Первая' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Панель a');
  });

  it('ArrowRight переключает вкладку и переносит фокус, disabled пропускается', async () => {
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} />);
    const first = screen.getByRole('tab', { name: 'Первая' });
    const second = screen.getByRole('tab', { name: 'Вторая' });

    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '-1');

    // третья disabled → по кругу возвращаемся к первой
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(first).toHaveFocus();
  });

  it('controlled: не меняет вкладку без внешнего value', async () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="a" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Вторая' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Первая' })).toHaveAttribute('aria-selected', 'true');
  });

  it('value вне items: первая доступная вкладка остаётся в tab-order', () => {
    render(<Tabs items={items} value="нет-такой" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(tabs.every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });
});
