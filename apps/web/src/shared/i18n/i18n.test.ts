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

  it('student:home.streak в en склоняется по числу', () => {
    const en = i18n.getFixedT('en', 'student');
    expect(en('home.streak', { count: 1 })).toBe('Streak: 1 day');
    expect(en('home.streak', { count: 3 })).toBe('Streak: 3 days');
    expect(i18n.getFixedT('ru', 'student')('home.streak', { count: 5 })).toBe('Серия: 5 дн.');
  });

  it('число перед словом в переменной не count — склоняется через count', () => {
    const student = i18n.getFixedT('ru', 'student');
    expect(student('courses.blocks', { completed: 0, count: 1 })).toBe('0 из 1 блока');
    expect(student('courses.blocks', { completed: 1, count: 3 })).toBe('1 из 3 блоков');
    expect(student('courses.blocks', { completed: 2, count: 5 })).toBe('2 из 5 блоков');
    expect(student('courses.blocks', { completed: 7, count: 21 })).toBe('7 из 21 блока');
    const studentEn = i18n.getFixedT('en', 'student');
    expect(studentEn('courses.blocks', { completed: 0, count: 1 })).toBe('0 of 1 block');
    expect(studentEn('courses.blocks', { completed: 1, count: 2 })).toBe('1 of 2 blocks');

    const teacherEn = i18n.getFixedT('en', 'teacher');
    expect(teacherEn('courses.modulesCount', { count: 1 })).toBe('1 module');
    expect(teacherEn('courses.blocksCount', { count: 3 })).toBe('3 blocks');
    const teacher = i18n.getFixedT('ru', 'teacher');
    expect(teacher('courses.modulesCount', { count: 5 })).toBe('5 мод.');
    expect(teacher('courses.blocksCount', { count: 1 })).toBe('1 бл.');

    expect(teacher('courseBuilder.form.characters', { count: 1 })).toBe('1 символ');
    expect(teacher('courseBuilder.form.characters', { count: 2 })).toBe('2 символа');
    expect(teacher('courseBuilder.form.characters', { count: 10 })).toBe('10 символов');
    expect(teacherEn('courseBuilder.form.characters', { count: 1 })).toBe('1 character');
  });

  it('describeApiError берёт текст на текущем языке', async () => {
    const error = new ApiClientError({ code: 'EXTERNAL_INTEGRATION', message: 'x', status: 0 });
    expect(describeApiError(error)).toBe('Сервис временно недоступен, возможно, нет соединения');
    await setLanguage('en');
    expect(describeApiError(error)).toBe(
      'Service is temporarily unavailable, check your connection',
    );
  });
});
