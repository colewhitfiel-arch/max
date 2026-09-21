import type { KnowledgeNode } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import {
  atomize,
  mapLimit,
  renderTopicMaterial,
  windowAtoms,
} from '../../src/modules/course-builder/pipeline/atoms';
import { coverageStats, verifySurvey } from '../../src/modules/course-builder/pipeline/citations';
import {
  mapLesson,
  mapLessonBlock,
  theoryFromNodes,
} from '../../src/modules/course-builder/pipeline/draft-mapper';
import { planModules } from '../../src/modules/course-builder/pipeline/planner';

const node = (id: string, atomIds: number[], importance = 2): KnowledgeNode => ({
  id,
  title: `Узел ${id}`,
  statement: `Утверждение ${id}`,
  type: 'CONCEPT',
  atomIds,
  importance,
  misconceptions: [],
});

describe('atomize', () => {
  it('режет по абзацам, клеит заголовки и короткие куски, нумерует подряд', () => {
    const text = [
      '# Arduino',
      '',
      'Arduino — это плата с микроконтроллером, которую можно программировать через USB.',
      '',
      'Кратко.',
      '',
      'Ультразвуковой датчик измеряет расстояние по времени отражения звука от препятствия.',
      '',
      '- Провода нужны для подключения датчика к плате и питания.',
      '- Библиотека упрощает чтение показаний и делает код короче и понятнее.',
    ].join('\n');
    const atoms = atomize(text, 'file.md');
    expect(atoms.map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(atoms[0]!.text).toMatch(/^Arduino\. Arduino — это плата/);
    expect(atoms[1]!.text).toMatch(/^Кратко\. Ультразвуковой/);
    expect(atoms[2]!.text).toMatch(/^Провода/);
    expect(atoms.every((a) => a.source === 'file.md')).toBe(true);
  });

  it('длинный абзац режется по предложениям в пределах maxChars', () => {
    const sentence = 'Это предложение про датчики и провода для платы. ';
    const atoms = atomize(sentence.repeat(30), 'x', { maxChars: 200 });
    expect(atoms.length).toBeGreaterThan(5);
    expect(atoms.every((a) => a.text.length <= 200)).toBe(true);
  });

  it('конспект по теме превращается в атомы с источником topic', () => {
    const text = renderTopicMaterial({
      title: 'Циклы',
      sections: [
        {
          heading: 'Введение',
          paragraphs: ['Цикл for перебирает элементы последовательности по одному.'],
        },
      ],
    });
    const atoms = atomize(text, 'topic');
    expect(atoms).toHaveLength(1);
    expect(atoms[0]!.text).toContain('Введение. Цикл for');
  });

  it('mapLimit после ошибки не стартует новые элементы', async () => {
    const started: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  it('окна и mapLimit сохраняют порядок', async () => {
    const atoms = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, text: 'x'.repeat(100) }));
    const windows = windowAtoms(atoms, 350);
    expect(windows.map((w) => w.length)).toEqual([3, 3, 3, 1]);
    const out = await mapLimit([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });
});

describe('verifySurvey', () => {
  const atoms = [1, 2, 3, 4].map((id) => ({ id, text: `a${id}` }));

  it('отбрасывает несуществующие цитаты и узлы без улик, сливает дубли, сортирует по источнику', () => {
    const { nodes, rejected } = verifySurvey(
      [
        {
          title: 'Поздний',
          statement: 's',
          type: 'FACT',
          atomIds: [4, 99],
          importance: 1,
          misconceptions: [],
        },
        {
          title: 'Выдумка',
          statement: 's',
          type: 'FACT',
          atomIds: [42],
          importance: 3,
          misconceptions: [],
        },
        {
          title: 'Ранний',
          statement: 's',
          type: 'CONCEPT',
          atomIds: [1],
          importance: 2,
          misconceptions: ['m1'],
        },
        {
          title: 'ранний!',
          statement: 's',
          type: 'CONCEPT',
          atomIds: [2],
          importance: 3,
          misconceptions: ['m2'],
        },
      ],
      atoms,
    );
    expect(rejected).toBe(1);
    expect(nodes.map((n) => n.title)).toEqual(['Ранний', 'Поздний']);
    expect(nodes[0]).toMatchObject({
      id: 'n1',
      atomIds: [1, 2],
      importance: 3,
      misconceptions: ['m1', 'm2'],
    });
    expect(nodes[1]!.atomIds).toEqual([4]);
    expect(coverageStats(nodes, atoms, rejected)).toEqual({
      atomsTotal: 4,
      atomsCited: 3,
      coverage: 0.75,
      nodesRejected: 1,
    });
  });
});

describe('planModules', () => {
  it('режет узлы на модули 3–5 и не оставляет короткий хвост', () => {
    const nodes = Array.from({ length: 11 }, (_, i) => node(`n${i + 1}`, [i + 1], i === 4 ? 3 : 1));
    const plan = planModules(nodes);
    expect(plan.map((m) => m.nodeIds.length)).toEqual([4, 4, 3]);
    expect(plan[1]!.title).toBe('Узел n5');
  });

  it('при избытке узлов отбрасывает наименее важные', () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      node(`n${i + 1}`, [i + 1], i % 2 === 0 ? 3 : 1),
    );
    const plan = planModules(nodes, { maxModules: 2, maxPerModule: 5 });
    const kept = plan.flatMap((m) => m.nodeIds);
    expect(kept).toHaveLength(10);
    expect(kept.every((id) => Number(id.slice(1)) % 2 === 1)).toBe(true);
  });
});

describe('draft-mapper', () => {
  it('без теории от модели подставляет теорию из узлов и атомов', () => {
    const theory = theoryFromNodes([
      {
        title: 'Резистор',
        statement: 'Ограничивает ток.',
        evidence: [{ text: 'Светодиод ставят через резистор 220 Ом.' }],
      },
    ]);
    expect(theory).toContain('### Резистор');
    expect(theory).toContain('- Светодиод ставят через резистор 220 Ом.');
    const module = mapLesson(
      'Урок',
      {
        summary: 'Кратко.',
        blocks: [{ kind: 'HOMEWORK', title: 'ДЗ', instructions: 'Собери схему' }],
      },
      ['topic'],
      { theoryMarkdown: theory },
    );
    expect(module.blocks[0]).toMatchObject({ type: 'TEXT', content: { markdown: theory } });
    expect(module.blocks).toHaveLength(2);
  });

  it('маппит все виды блоков и генерирует идентификаторы', () => {
    const quiz = mapLessonBlock({
      kind: 'QUIZ',
      title: 'Тест',
      questions: [
        { text: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndexes: [1, 3] },
        { text: 'Q2', options: ['a', 'b'], correctIndexes: [7] },
      ],
    });
    expect(quiz?.type).toBe('QUIZ');
    if (quiz?.type === 'QUIZ') {
      expect(quiz.content.questions).toHaveLength(1);
      expect(quiz.content.questions[0]).toMatchObject({
        id: 'q1',
        correctOptionIds: ['b', 'd'],
        multiple: true,
      });
    }
    expect(mapLessonBlock({ kind: 'QUIZ', title: '', questions: [] })).toBeNull();
    expect(
      mapLessonBlock({ kind: 'PRACTICE', title: '  ', instructions: 'собери схему' }),
    ).toMatchObject({ type: 'PRACTICE', title: 'Практика' });
    expect(mapLessonBlock({ kind: 'FILL_GAPS', title: 'x', text: 'без пропусков' })).toBeNull();
    expect(
      mapLessonBlock({ kind: 'FILL_GAPS', title: 'x', text: 'Проверь **{{ответ}}** схемы.' }),
    ).toBeNull();
    expect(
      mapLessonBlock({
        kind: 'FILL_GAPS',
        title: 'Блок 3: Пропуски',
        text: 'Проверь **{{ответ}}** схемы. Светодиод ставят через **{{резистор}}**.',
      }),
    ).toMatchObject({
      title: 'Пропуски',
      content: { data: { text: 'Светодиод ставят через {{резистор}}.' } },
    });
    expect(mapLessonBlock({ kind: 'FILL_GAPS', title: 'x', text: 'есть {{ток}}' })?.type).toBe(
      'INTERACTIVE',
    );
    expect(mapLessonBlock({ kind: 'HOMEWORK', title: 'x', instructions: 'сделай' })).toMatchObject({
      type: 'HOMEWORK',
      content: { submissionType: 'BOTH' },
    });
  });

  it('урок без теории получает TEXT из summary', () => {
    const module = mapLesson(
      'Модуль',
      {
        summary: 'Кратко о модуле',
        blocks: [
          { kind: 'PRACTICE', title: 'П', instructions: 'i' },
          { kind: 'QUESTION', title: 'В', prompt: 'p' },
        ],
      },
      ['file.md'],
    );
    expect(module.blocks[0]).toMatchObject({
      type: 'TEXT',
      content: { markdown: '## Модуль\n\nКратко о модуле' },
    });
    expect(module.sourceRefs).toEqual(['file.md']);
  });
});
