/** Даты: DateOnly без сдвига через полночь UTC и словесные подписи из i18n. */
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateOnly,
  formatDue,
  formatRelativeDay,
  formatTime,
  parseDateOnly,
} from './dates';

describe('parseDateOnly / formatDateOnly', () => {
  it('полночь того же дня в поясе устройства', () => {
    const date = parseDateOnly('2026-10-01');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 1]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });

  it('формат — как formatDate для этого календарного дня', () => {
    expect(formatDateOnly('2026-10-01', 'ru')).toBe(formatDate(new Date(2026, 9, 1), 'ru'));
    expect(formatDateOnly('2027-01-31', 'en')).toBe(formatDate(new Date(2027, 0, 31), 'en'));
  });
});

describe('formatRelativeDay / formatDue: подписи из i18n на языке аргумента', () => {
  const now = new Date(2026, 8, 23, 12, 0);

  it('сегодня / вчера / завтра на ru и en', () => {
    expect(formatRelativeDay(new Date(2026, 8, 23, 9, 0), 'ru', now)).toBe('сегодня');
    expect(formatRelativeDay(new Date(2026, 8, 22, 9, 0), 'ru', now)).toBe('вчера');
    expect(formatRelativeDay(new Date(2026, 8, 24, 9, 0), 'en', now)).toBe('tomorrow');
    expect(formatRelativeDay(new Date(2026, 8, 20, 9, 0), 'ru', now)).toBe(
      formatDate(new Date(2026, 8, 20, 9, 0), 'ru'),
    );
  });

  it('дедлайн: просрочено, сегодня со временем, завтра, через N дней', () => {
    expect(formatDue(new Date(2026, 8, 23, 11, 0), 'ru', now)).toBe('просрочено');
    expect(formatDue(new Date(2026, 8, 23, 11, 0), 'en', now)).toBe('overdue');
    expect(formatDue(new Date(2026, 8, 23, 15, 30), 'ru', now)).toBe(
      `сегодня, ${formatTime(new Date(2026, 8, 23, 15, 30), 'ru')}`,
    );
    expect(formatDue(new Date(2026, 8, 24, 10, 0), 'ru', now)).toBe('завтра');
    expect(formatDue(new Date(2026, 8, 26, 10, 0), 'ru', now)).toBe('через 3 дн.');
    expect(formatDue(new Date(2026, 8, 26, 10, 0), 'en-US', now)).toBe('in 3 d');
  });
});
