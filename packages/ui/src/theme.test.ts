import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, getTheme, resolveTheme } from './theme';

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('ставит data-theme на <html>', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('getTheme читает атрибут, без атрибута — system', () => {
    expect(getTheme()).toBe('system');
    applyTheme('dark');
    expect(getTheme()).toBe('dark');
  });

  it('resolveTheme возвращает явную тему как есть', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });
});
