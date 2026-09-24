import { afterEach, describe, expect, it } from 'vitest';
import { ACCENTS, applyAccent, applyTheme, getAccent, getTheme, resolveTheme } from './theme';

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

describe('applyAccent', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-accent');
  });

  it('green ставит data-accent, blue (по умолчанию) снимает атрибут', () => {
    expect(getAccent()).toBe('blue');
    applyAccent('green');
    expect(document.documentElement.getAttribute('data-accent')).toBe('green');
    expect(getAccent()).toBe('green');
    applyAccent('blue');
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
    expect(getAccent()).toBe('blue');
  });

  it('orange (режим репетитора) ставит data-accent и читается getAccent', () => {
    applyAccent('orange');
    expect(document.documentElement.getAttribute('data-accent')).toBe('orange');
    expect(getAccent()).toBe('orange');
    applyAccent('green');
    expect(getAccent()).toBe('green');
    applyAccent('blue');
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });

  it('неизвестное значение атрибута читается как blue', () => {
    document.documentElement.setAttribute('data-accent', 'purple');
    expect(getAccent()).toBe('blue');
  });

  it('ACCENTS перечисляет все акценты', () => {
    expect(ACCENTS).toEqual(['blue', 'green', 'orange']);
  });
});
