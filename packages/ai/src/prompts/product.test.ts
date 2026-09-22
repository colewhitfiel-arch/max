import { describe, expect, it } from 'vitest';
import { MockAiProvider } from '../providers/mock';
import { AiService } from '../service';
import { buildRequest } from './registry';
import {
  createProductRegistry,
  lessonPrompt,
  LessonResultSchema,
  onboardingTurnPrompt,
  OnboardingTurnSchema,
  productMockRules,
  recommendClubsPrompt,
  ClubRecommendationsSchema,
  renderAtomsForPrompt,
  renderClubsForPrompt,
  renderNodesForPrompt,
  surveyPrompt,
  SurveyResultSchema,
  topicMaterialPrompt,
  TopicMaterialSchema,
  trajectoryPrompt,
  TrajectoryResultSchema,
  tutorPrompt,
  parseAtomsFromPrompt,
} from './index';

const ai = new AiService({ provider: new MockAiProvider({ responses: productMockRules }) });

describe('LessonResultSchema', () => {
  it('отбрасывает невалидные блоки и пустые заголовки не роняют урок', () => {
    const lesson = LessonResultSchema.parse({
      summary: '',
      blocks: [
        { kind: 'TEXT', title: '', markdown: 'Теория.' },
        { kind: 'QUIZ', title: 'Тест' }, // нет questions — выбрасывается
        { kind: 'UNKNOWN', title: 'x' },
        { kind: 'PRACTICE', markdown: 'без instructions' },
        { kind: 'HOMEWORK', title: 'ДЗ', instructions: 'Собери схему' },
      ],
    });
    expect(lesson.summary).toBe('');
    expect(lesson.blocks.map((b) => b.kind)).toEqual(['TEXT', 'HOMEWORK']);
    expect(lesson.blocks[0]?.title).toBe('');
  });

  it('урок только из теории — ошибка схемы (модель переспросится)', () => {
    const result = LessonResultSchema.safeParse({
      summary: 'x',
      blocks: [{ kind: 'TEXT', title: 'Теория', markdown: 'Текст.' }],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('практического');
  });

  it('урок без единого валидного блока — ошибка схемы', () => {
    expect(LessonResultSchema.safeParse({ summary: 'x', blocks: [{ kind: 'QUIZ' }] }).success).toBe(
      false,
    );
  });
});

describe('продуктовые промпты', () => {
  it('регистрируются без дублей', () => {
    expect(createProductRegistry().size).toBe(7);
  });

  it('атомы сериализуются и разбираются обратно', () => {
    const atoms = [
      { id: 1, text: 'Первый атом' },
      { id: 2, text: 'Второй  атом\nс переносом' },
    ];
    const text = renderAtomsForPrompt(atoms);
    expect(parseAtomsFromPrompt(text)).toEqual([
      { id: 1, text: 'Первый атом' },
      { id: 2, text: 'Второй атом с переносом' },
    ]);
  });

  it('mock: конспект по теме проходит схему', async () => {
    const req = buildRequest(topicMaterialPrompt, { topic: 'Циклы в Python: практика' });
    const { data } = await ai.chatJson(req, TopicMaterialSchema);
    expect(data.sections.length).toBeGreaterThan(0);
  });

  it('mock: survey цитирует только существующие атомы', async () => {
    const atoms = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, text: `Атом номер ${i + 1}` }));
    const req = buildRequest(surveyPrompt, { atomsText: renderAtomsForPrompt(atoms) });
    const { data } = await ai.chatJson(req, SurveyResultSchema);
    expect(data.nodes.length).toBe(3);
    for (const node of data.nodes) for (const id of node.atomIds) expect(id).toBeLessThanOrEqual(5);
  });

  it('mock: урок содержит теорию и практику', async () => {
    const nodesText = renderNodesForPrompt([
      {
        id: 'n1',
        title: 'Цикл for',
        statement: 'Цикл for перебирает элементы',
        type: 'CONCEPT',
        misconceptions: [],
        evidence: [{ id: 1, text: 'for перебирает элементы последовательности' }],
      },
    ]);
    const req = buildRequest(lessonPrompt, {
      moduleTitle: 'Циклы',
      nodesText,
      position: { index: 0, total: 1 },
    });
    const { data } = await ai.chatJson(req, LessonResultSchema);
    expect(data.blocks.map((b) => b.kind)).toEqual(['TEXT', 'QUIZ', 'FILL_GAPS', 'PRACTICE']);
  });

  it('mock: онбординг завершается после трёх ответов', async () => {
    const vars = { studentName: 'Алексей', clubsSummary: 'робототехника', answered: 3 };
    const history = [
      { role: 'assistant' as const, content: 'Привет!' },
      { role: 'user' as const, content: 'Люблю роботов' },
      { role: 'assistant' as const, content: 'А предметы?' },
      { role: 'user' as const, content: 'Информатика' },
      { role: 'assistant' as const, content: 'Сколько часов?' },
      { role: 'user' as const, content: 'Четыре часа' },
      { role: 'assistant' as const, content: 'Что попробовать позже?' },
      { role: 'user' as const, content: 'Может быть, шахматы через год' },
    ];
    const req = buildRequest(onboardingTurnPrompt, vars, { history });
    const { data } = await ai.chatJson(req, OnboardingTurnSchema);
    expect(data.isComplete).toBe(true);
    expect(data.profileDraft?.interests.length).toBeGreaterThan(0);
    expect(data.profileDraft?.futureInterests).toEqual(['Может быть, шахматы через год']);
  });

  it('mock: рекомендации используют id из списка', async () => {
    const clubsText = renderClubsForPrompt([
      { id: 'c1', title: 'Робототехника', category: 'ROBOTICS', description: 'Роботы', tags: [] },
      { id: 'c2', title: 'Шахматы', category: 'CHESS', description: 'Игра', tags: ['логика'] },
    ]);
    const req = buildRequest(recommendClubsPrompt, {
      profileText: 'Любит роботов',
      clubsText,
      limit: 5,
    });
    const { data } = await ai.chatJson(req, ClubRecommendationsSchema);
    expect(data.items.map((i) => i.clubId)).toEqual(['c1', 'c2']);
  });

  it('mock: траектория и тьютор отвечают', async () => {
    const traj = await ai.chatJson(
      buildRequest(trajectoryPrompt, {
        context: 'Ученик: Алексей, 7Б.',
        clubsText: '',
        coursesText: '',
      }),
      TrajectoryResultSchema,
    );
    expect(traj.data.summary).toContain('Алексей');
    const res = await ai.chat(
      buildRequest(
        tutorPrompt,
        { context: 'x' },
        { history: [{ role: 'user', content: 'Что сделать сегодня?' }] },
      ),
    );
    expect(res.content).toContain('сегодня');
  });
});
