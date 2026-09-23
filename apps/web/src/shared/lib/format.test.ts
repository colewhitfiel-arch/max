import { describe, expect, it } from 'vitest';
import { formatPercent, formatRate } from './format';

describe('formatRate', () => {
  it('доля → проценты без пробела, как formatPercent', () => {
    expect(formatRate(0.88)).toBe('88%');
    expect(formatRate(1, 'en')).toBe('100%');
    expect(formatRate(0.255)).toBe(formatPercent(25.5));
    expect(formatRate(null)).toBe('—');
    expect(formatRate(Number.NaN)).toBe('—');
  });
});
