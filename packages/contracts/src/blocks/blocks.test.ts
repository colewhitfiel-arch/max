import { describe, expect, it } from 'vitest';
import { HttpUrlSchema, isHttpUrl } from '../common';
import {
  type CourseBlock,
  CourseBlockForStudentSchema,
  CourseBlockSchema,
  toStudentBlock,
} from '../entities';
import { SchoolSchema } from '../entities/school';
import { SubmitAssignmentBodySchema } from '../routes/assignments';
import { StudentBlockDetailSchema } from '../routes/courses';
import { CreateLessonBodySchema } from '../routes/groups';
import { IdempotencyKeyHeadersSchema } from '../routes/meta';
import { QuizQuestionSchema, VideoContentSchema } from './index';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const base = {
  id: id(1),
  moduleId: id(2),
  order: 0,
  title: 'Блок',
  estimatedMinutes: 5,
  isRequired: true,
};

const quizBlock: CourseBlock = {
  ...base,
  type: 'QUIZ',
  content: {
    passScore: 60,
    questions: [
      {
        id: 'q1',
        text: 'Какой датчик измеряет расстояние?',
        options: [
          { id: 'a', text: 'Ультразвуковой' },
          { id: 'b', text: 'Температурный' },
        ],
        correctOptionIds: ['a'],
        explanation: 'Время отражения звука',
        multiple: false,
      },
    ],
  },
};

const questionBlock: CourseBlock = {
  ...base,
  type: 'QUESTION',
  content: { prompt: 'Зачем нужен резистор?', expectedAnswer: 'Ограничить ток', rubric: '2 балла' },
};

describe('блоки: ученику не уходят ответы', () => {
  it('toStudentBlock: QUIZ без correctOptionIds и explanation', () => {
    const student = toStudentBlock(quizBlock);
    const json = JSON.stringify(student);
    expect(json).not.toContain('correctOptionIds');
    expect(json).not.toContain('explanation');
    expect(CourseBlockForStudentSchema.parse(student)).toEqual(student);
    expect(student).toMatchObject({
      type: 'QUIZ',
      content: {
        passScore: 60,
        questions: [{ id: 'q1', options: [{ id: 'a' }, { id: 'b' }], multiple: false }],
      },
    });
  });

  it('toStudentBlock: QUESTION без эталона и критериев', () => {
    const student = toStudentBlock(questionBlock);
    expect(student.content).toEqual({ prompt: 'Зачем нужен резистор?' });
    expect(JSON.stringify(student)).not.toMatch(/expectedAnswer|rubric|Ограничить ток/);
  });

  it('toStudentBlock: остальные типы — без изменений', () => {
    const text: CourseBlock = { ...base, type: 'TEXT', content: { markdown: '# Arduino' } };
    expect(toStudentBlock(text)).toEqual(text);
  });

  it('StudentBlockDetailSchema вырезает ответы даже при прямом парсинге', () => {
    const parsed = StudentBlockDetailSchema.parse({
      ...questionBlock,
      courseId: id(3),
      assignment: null,
      progress: null,
    });
    expect(JSON.stringify(parsed)).not.toMatch(/expectedAnswer|rubric/);
    const quiz = StudentBlockDetailSchema.parse({
      ...quizBlock,
      courseId: id(3),
      assignment: null,
      progress: null,
    });
    expect(JSON.stringify(quiz)).not.toMatch(/correctOptionIds|explanation/);
  });

  it('преподавательская схема по-прежнему с ответами', () => {
    expect(CourseBlockSchema.parse(questionBlock)).toEqual(questionBlock);
    expect(CourseBlockSchema.parse(quizBlock)).toEqual(quizBlock);
  });
});

describe('VIDEO', () => {
  it('ссылка — только http/https', () => {
    expect(isHttpUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,hi')).toBe(false);
    expect(isHttpUrl('не ссылка')).toBe(false);
    expect(HttpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(
      VideoContentSchema.safeParse({ provider: 'youtube', url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('нужна ссылка или файл', () => {
    expect(VideoContentSchema.safeParse({ provider: 'youtube' }).success).toBe(false);
    expect(
      VideoContentSchema.safeParse({ provider: 'youtube', url: 'https://youtu.be/x' }).success,
    ).toBe(true);
    expect(VideoContentSchema.safeParse({ provider: 'file', fileId: id(9) }).success).toBe(true);
  });
});

describe('QUIZ: согласованность правильных вариантов', () => {
  const question = quizBlock.type === 'QUIZ' ? quizBlock.content.questions[0]! : null;

  it('правильные варианты — из options', () => {
    expect(QuizQuestionSchema.safeParse(question).success).toBe(true);
    expect(QuizQuestionSchema.safeParse({ ...question, correctOptionIds: ['z'] }).success).toBe(
      false,
    );
  });

  it('multiple=false ⇒ ровно один правильный; multiple=true — можно несколько', () => {
    expect(
      QuizQuestionSchema.safeParse({ ...question, correctOptionIds: ['a', 'b'] }).success,
    ).toBe(false);
    expect(
      QuizQuestionSchema.safeParse({ ...question, correctOptionIds: ['a', 'b'], multiple: true })
        .success,
    ).toBe(true);
  });
});

describe('тела запросов', () => {
  it('CreateLessonBodySchema: конец позже начала', () => {
    const startsAt = '2026-09-23T12:00:00.000Z';
    expect(
      CreateLessonBodySchema.safeParse({ startsAt, endsAt: '2026-09-23T13:30:00.000Z' }).success,
    ).toBe(true);
    const same = CreateLessonBodySchema.safeParse({ startsAt, endsAt: startsAt });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.path).toEqual(['endsAt']);
    expect(
      CreateLessonBodySchema.safeParse({ startsAt, endsAt: '2026-09-23T11:00:00.000Z' }).success,
    ).toBe(false);
  });

  it('SubmitAssignmentBodySchema: пустая сдача не проходит', () => {
    for (const empty of [
      {},
      { text: '   ' },
      { fileIds: [] },
      { answers: {} },
      { answers: { q1: [] } },
    ]) {
      expect(SubmitAssignmentBodySchema.safeParse(empty).success, JSON.stringify(empty)).toBe(
        false,
      );
    }
    for (const filled of [
      { text: 'Готово' },
      { fileIds: [id(5)] },
      { answers: { q1: ['a'] } },
      { answers: { text: 'ответ' } },
    ]) {
      expect(SubmitAssignmentBodySchema.safeParse(filled).success, JSON.stringify(filled)).toBe(
        true,
      );
    }
  });

  it('Idempotency-Key обязателен', () => {
    expect(IdempotencyKeyHeadersSchema.safeParse({}).success).toBe(false);
    expect(IdempotencyKeyHeadersSchema.safeParse({ 'idempotency-key': 'k1' }).success).toBe(true);
  });

  it('SchoolSchema: timezone — известный IANA-пояс', () => {
    const school = { id: id(1), name: 'Школа', settings: { showTeacherContacts: true } };
    expect(SchoolSchema.safeParse({ ...school, timezone: 'Europe/Moscow' }).success).toBe(true);
    expect(SchoolSchema.safeParse({ ...school, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(SchoolSchema.safeParse({ ...school, timezone: '' }).success).toBe(false);
  });
});
