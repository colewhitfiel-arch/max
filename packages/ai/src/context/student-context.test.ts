import { describe, expect, it } from 'vitest';
import { estimateTokens, serializeStudentContext, type StudentContext } from './student-context';

function makeContext(overrides: Partial<StudentContext> = {}): StudentContext {
  return {
    student: {
      name: 'Маша',
      classLabel: '7 класс',
      interests: ['робототехника', 'рисование'],
      goals: ['собрать робота'],
      weeklyHours: 5,
      preferredFormats: ['видео', 'практика'],
      aiProfileSummary: 'Любит практику, быстро теряет интерес к теории.',
    },
    clubs: [
      {
        title: 'Робототехника',
        category: 'техника',
        teacherName: 'Иван',
        scheduleText: 'пн, ср 16:00',
        progressPercent: 45,
        attendanceRate: 0.9,
      },
    ],
    upcomingLessons: [
      { club: 'Робототехника', startsAt: '2026-09-22T13:00:00.000Z', topic: 'Сервоприводы' },
    ],
    openAssignments: [
      {
        title: 'Собрать манипулятор',
        club: 'Робототехника',
        dueAt: '2026-09-25T15:00:00.000Z',
        type: 'практика',
        status: 'не начато',
      },
    ],
    recentResults: [
      {
        title: 'Тест 3',
        club: 'Робототехника',
        score: 8,
        maxScore: 10,
        isLate: true,
        at: '2026-09-20T12:00:00.000Z',
      },
    ],
    stats30d: {
      attendanceRate: 0.9,
      completionRate: 0.75,
      activityScore: 62,
      absences: 2,
      lateCount: 1,
    },
    courseProgress: [{ course: 'Основы Arduino', percent: 45, nextBlockTitle: 'Сервоприводы' }],
    trajectory: { summary: 'Углубляться в электронику', nextSteps: ['Пройти блок про датчики'] },
    now: '2026-09-21T12:30:00.000Z',
    timezone: 'Europe/Moscow',
    ...overrides,
  };
}

describe('serializeStudentContext', () => {
  it('рендерит все секции компактным русским текстом в поясе ученика', () => {
    const text = serializeStudentContext(makeContext());
    expect(text).toContain('Ученик: Маша, 7 класс.');
    expect(text).toContain('Интересы: робототехника, рисование.');
    expect(text).toContain('Сейчас: 21.09.2026 15:30 (Europe/Moscow).');
    expect(text).toContain('Кружки (1):');
    expect(text).toContain('посещаемость: 90%');
    expect(text).toContain('- 22.09 16:00 — Робототехника: Сервоприводы');
    expect(text).toContain(
      '«Собрать манипулятор» (Робототехника, практика, не начато), срок: 25.09 18:00',
    );
    expect(text).toContain('«Тест 3» (Робототехника): 8/10, 20.09 15:00, с опозданием');
    expect(text).toContain(
      'Статистика за 30 дней: посещаемость 90%, выполнение заданий 75%, индекс активности 62, пропусков 2, опозданий 1.',
    );
    expect(text).toContain('«Основы Arduino»: 45%, следующий блок: «Сервоприводы»');
    expect(text).toContain('Траектория: Углубляться в электронику');
    expect(text).toContain('- Пройти блок про датчики');
  });

  it('пустые списки и null-рейты', () => {
    const text = serializeStudentContext(
      makeContext({
        clubs: [],
        upcomingLessons: [],
        openAssignments: [],
        recentResults: [],
        courseProgress: [],
        trajectory: undefined,
        stats30d: {
          attendanceRate: null,
          completionRate: null,
          activityScore: 0,
          absences: 0,
          lateCount: 0,
        },
      }),
    );
    expect(text).not.toContain('Кружки');
    expect(text).not.toContain('Траектория');
    expect(text).toContain('посещаемость нет данных');
  });

  it('невалидный часовой пояс — fallback на UTC, битая дата — как есть', () => {
    const text = serializeStudentContext(
      makeContext({
        timezone: 'Nowhere/Land',
        upcomingLessons: [{ club: 'X', startsAt: 'не дата' }],
      }),
    );
    expect(text).toContain('Сейчас: 21.09.2026 12:30 (Nowhere/Land).');
    expect(text).toContain('- не дата — X');
  });

  it('схлопывает переводы строк в значениях', () => {
    const text = serializeStudentContext(
      makeContext({
        student: { ...makeContext().student, name: 'Ма\nша', aiProfileSummary: undefined },
      }),
    );
    expect(text).toContain('Ученик: Ма ша');
  });

  it('урезает списки при превышении maxChars и добавляет «…и ещё N»', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      title: `Задание номер ${i + 1} с длинным названием для объёма`,
      club: 'Робототехника',
      type: 'домашнее',
      status: 'в работе',
    }));
    const results = Array.from({ length: 10 }, (_, i) => ({
      title: `Контрольная ${i + 1}`,
      club: 'Робототехника',
      score: i,
      maxScore: 10,
      isLate: false,
      at: '2026-09-20T12:00:00.000Z',
    }));
    const full = serializeStudentContext(
      makeContext({ openAssignments: many, recentResults: results }),
    );
    expect(full.length).toBeGreaterThan(1200);

    const limited = serializeStudentContext(
      makeContext({ openAssignments: many, recentResults: results }),
      { maxChars: 1200 },
    );
    expect(limited.length).toBeLessThanOrEqual(1200);
    expect(limited).toMatch(/…и ещё \d+/);
    // Заголовки и статистика остаются, урезаются именно элементы списков
    expect(limited).toContain('Ученик: Маша');
    expect(limited).toContain('Статистика за 30 дней');
    expect(limited).toContain('Открытые задания (10):');
    // Менее важные секции (результаты) урезаются раньше заданий
    const shownResults = (limited.match(/- «Контрольная/g) ?? []).length;
    const shownAssignments = (limited.match(/- «Задание номер/g) ?? []).length;
    expect(shownResults).toBeLessThan(shownAssignments);
  });

  it('maxItems ограничивает списки заранее', () => {
    const lessons = Array.from({ length: 5 }, (_, i) => ({
      club: `Кружок ${i}`,
      startsAt: '2026-09-22T13:00:00.000Z',
    }));
    const text = serializeStudentContext(makeContext({ upcomingLessons: lessons }), {
      maxItems: 2,
    });
    expect(text).toContain('Ближайшие занятия (7 дней) (5):');
    expect(text).toContain('…и ещё 3');
  });

  it('жёстко обрезает, если даже без списков не влезает', () => {
    const text = serializeStudentContext(makeContext(), { maxChars: 50 });
    expect(text.length).toBe(50);
    expect(text.endsWith('…')).toBe(true);
  });

  it('дефолтный лимит 6000 символов даёт ≈2000 токенов', () => {
    const text = serializeStudentContext(makeContext());
    expect(estimateTokens(text)).toBeLessThan(2500);
    expect(estimateTokens('абв')).toBe(1);
  });
});
