import { afterEach, describe, expect, it } from 'vitest';
import { ApiClientError, describeApiError } from '../api/errors';
import { i18n, setLanguage } from './index';

describe('i18n: плюрализация ru (Intl.PluralRules, формат v4 _one/_few/_many)', () => {
  afterEach(async () => {
    await setLanguage('ru');
  });

  it('i18next резолвит суффиксы через Intl.PluralRules', () => {
    // compatibilityJSON 'v3' дал бы суффиксы _0/_1/_2 — формы _few/_many не подхватились бы.
    expect(i18n.options.compatibilityJSON).toBeUndefined();
    i18n.addResourceBundle('ru', 'plural-test', {
      item_one: '{{count}} задание',
      item_few: '{{count}} задания',
      item_many: '{{count}} заданий',
      item_other: '{{count}} задания',
    });
    const t = i18n.getFixedT('ru', 'plural-test');
    expect(t('item', { count: 1 })).toBe('1 задание');
    expect(t('item', { count: 21 })).toBe('21 задание');
    expect(t('item', { count: 2 })).toBe('2 задания');
    expect(t('item', { count: 24 })).toBe('24 задания');
    expect(t('item', { count: 5 })).toBe('5 заданий');
    expect(t('item', { count: 11 })).toBe('11 заданий');
    expect(t('item', { count: 1.5 })).toBe('1.5 задания');
  });

  it('common:nav.notificationsUnread склоняется по числу', () => {
    const t = i18n.getFixedT('ru', 'common');
    expect(t('nav.notificationsUnread', { count: 1 })).toBe('Уведомления: 1 непрочитанное');
    expect(t('nav.notificationsUnread', { count: 3 })).toBe('Уведомления: 3 непрочитанных');
    expect(t('nav.notificationsUnread', { count: 5 })).toBe('Уведомления: 5 непрочитанных');
    const en = i18n.getFixedT('en', 'common');
    expect(en('nav.notificationsUnread', { count: 2 })).toBe('Notifications: 2 unread');
  });

  it('describeApiError берёт текст на текущем языке', async () => {
    const error = new ApiClientError({ code: 'EXTERNAL_INTEGRATION', message: 'x', status: 0 });
    expect(describeApiError(error)).toBe('Сервис временно недоступен, проверь соединение');
    await setLanguage('en');
    expect(describeApiError(error)).toBe(
      'Service is temporarily unavailable, check your connection',
    );
  });
});
