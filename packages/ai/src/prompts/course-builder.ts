import { z } from 'zod';
import type { AiChatRequest } from '../types';
import type { MockResponseRule } from '../providers/mock';
import { definePrompt } from './registry';

/**
 * Промпты пайплайна «материал → атомы → узлы знаний → уроки» (workstream G).
 * Идея из StudyMate: модель получает пронумерованные атомы и **цитирует номера**, а не текст;
 * подтверждение цитат делает код (apps/api course-builder/pipeline/citations.ts).
 */

// ---------- 1. Конспект по теме (режим «без конспекта») ----------

export const TopicMaterialSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        /** Каждый абзац — одна законченная мысль: определение, факт, шаг, пример. */
        paragraphs: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});
export type TopicMaterial = z.infer<typeof TopicMaterialSchema>;

export interface TopicMaterialVars {
  topic: string;
  instructions?: string;
  targetTitle?: string;
}

export const topicMaterialPrompt = definePrompt({
  id: 'course-builder.material-from-topic',
  version: 1,
  description:
    'Преподаватель описал тему/практику без конспекта — модель пишет учебный конспект, который дальше режется на атомы',
  system: [
    'Ты — методист дополнительного образования для школьников. Преподаватель описал тему занятия или практику,',
    'но у него нет конспекта. Напиши учебный конспект по этой теме на русском языке.',
    'Правила: 4–8 разделов, в каждом 3–6 абзацев. Каждый абзац — одна законченная мысль',
    '(определение, факт, шаг порядка действий или пример) длиной 1–3 предложения, без воды.',
    'Термины объясняй, приводи конкретные примеры и числа, где уместно. Не выдумывай ссылок и фамилий.',
    'Отвечай строго JSON: {"title": string, "sections": [{"heading": string, "paragraphs": string[]}]}.',
  ].join(' '),
  user: (vars: TopicMaterialVars) =>
    [
      `Тема / практика: ${vars.topic}`,
      vars.targetTitle ? `Название курса: ${vars.targetTitle}` : '',
      vars.instructions ? `Пожелания преподавателя: ${vars.instructions}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  schema: TopicMaterialSchema,
  temperature: 0.4,
  maxTokens: 4000,
});

// ---------- 2. Survey: узлы знаний с цитатами по номерам атомов ----------

export const SURVEY_NODE_TYPES = ['CONCEPT', 'FACT', 'PROCEDURE', 'SKILL', 'EXAMPLE'] as const;

export const SurveyResultSchema = z.object({
  nodes: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        statement: z.string().min(1),
        type: z.enum(SURVEY_NODE_TYPES),
        /** Номера атомов, которые подтверждают утверждение. */
        atomIds: z.array(z.number().int()).min(1),
        importance: z.number().int().min(1).max(3),
        misconceptions: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type SurveyResult = z.infer<typeof SurveyResultSchema>;

export interface SurveyVars {
  /** Атомы в формате `[N] текст`, по одному на строку (см. `renderAtomsForPrompt`). */
  atomsText: string;
  instructions?: string;
}

export const surveyPrompt = definePrompt({
  id: 'course-builder.survey',
  version: 1,
  description: 'Извлечь из окна атомов узлы знаний с цитатами по номерам атомов',
  system: [
    'Ты — эксперт по структурированию учебного материала. Тебе дан фрагмент материала,',
    'разбитый на пронумерованные атомы вида «[N] текст».',
    'Выдели узлы знаний: понятия (CONCEPT), факты (FACT), порядки действий (PROCEDURE), навыки (SKILL), примеры (EXAMPLE).',
    'Для каждого узла: короткое название, точное утверждение своими словами, тип, номера атомов, которые его подтверждают',
    '(только номера из фрагмента, ничего не выдумывай), важность 1–3 и 0–2 типичных заблуждения ученика.',
    'Не повторяй один узел дважды. Отвечай строго JSON: {"nodes": [{"title","statement","type","atomIds":[N],"importance","misconceptions":[]}]}.',
  ].join(' '),
  user: (vars: SurveyVars) =>
    [vars.instructions ? `Контекст курса: ${vars.instructions}\n` : '', 'Атомы:', vars.atomsText]
      .filter(Boolean)
      .join('\n'),
  schema: SurveyResultSchema,
  temperature: 0.2,
  maxTokens: 3000,
});

// ---------- 3. Урок (блоки) по модулю ----------

const quizQuestion = z.object({
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(3).max(5),
  /** Индексы правильных вариантов (0-based). */
  correctIndexes: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().optional(),
});

export const LessonBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('TEXT'), title: z.string().min(1), markdown: z.string().min(1) }),
  z.object({
    kind: z.literal('QUIZ'),
    title: z.string().min(1),
    questions: z.array(quizQuestion).min(1).max(6),
  }),
  z.object({
    kind: z.literal('FILL_GAPS'),
    title: z.string().min(1),
    /** Текст с пропусками вида {{ответ}}. */
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal('FLASHCARDS'),
    title: z.string().min(1),
    cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(2),
  }),
  z.object({
    kind: z.literal('PRACTICE'),
    title: z.string().min(1),
    instructions: z.string().min(1),
  }),
  z.object({
    kind: z.literal('HOMEWORK'),
    title: z.string().min(1),
    instructions: z.string().min(1),
  }),
  z.object({
    kind: z.literal('QUESTION'),
    title: z.string().min(1),
    prompt: z.string().min(1),
    expectedAnswer: z.string().optional(),
  }),
]);
export type LessonBlock = z.infer<typeof LessonBlockSchema>;

export const LessonResultSchema = z.object({
  summary: z.string().min(1),
  blocks: z.array(LessonBlockSchema).min(2),
});
export type LessonResult = z.infer<typeof LessonResultSchema>;

export interface LessonVars {
  moduleTitle: string;
  /** Узлы модуля с утверждениями и текстами атомов-улик (см. `renderNodesForPrompt`). */
  nodesText: string;
  instructions?: string;
  /** Номер модуля и их общее число — для связности курса. */
  position: { index: number; total: number };
}

export const lessonPrompt = definePrompt({
  id: 'course-builder.block',
  version: 1,
  description: 'Написать урок (блоки курса) по узлам модуля, опираясь только на атомы-улики',
  system: [
    'Ты — преподаватель дополнительного образования и автор интерактивных уроков для школьников.',
    'Тебе дан модуль курса: узлы знаний и атомы исходного материала, которые их подтверждают.',
    'Напиши урок только на основе этих атомов — не добавляй фактов, которых там нет.',
    'Состав урока: 1–3 блока TEXT (markdown, короткие абзацы, подзаголовки, объяснение простым языком, пример),',
    'затем практика после теории: обязательно один QUIZ (3–5 вопросов, 4 варианта, для заблуждений используй неправильные варианты),',
    'один FILL_GAPS (3–6 предложений с пропусками {{ответ}} — пропускай ключевые термины),',
    'по желанию FLASHCARDS (термин → определение) и один блок PRACTICE или HOMEWORK с конкретным заданием.',
    'Названия блоков — конкретные, без слова «блок». Язык — русский, обращение на «ты».',
    'Отвечай строго JSON: {"summary": string, "blocks": [ {"kind":"TEXT","title","markdown"} | {"kind":"QUIZ","title","questions":[{"text","options":[],"correctIndexes":[],"explanation"}]} | {"kind":"FILL_GAPS","title","text"} | {"kind":"FLASHCARDS","title","cards":[{"front","back"}]} | {"kind":"PRACTICE","title","instructions"} | {"kind":"HOMEWORK","title","instructions"} | {"kind":"QUESTION","title","prompt","expectedAnswer"} ]}.',
  ].join(' '),
  user: (vars: LessonVars) =>
    [
      `Модуль ${vars.position.index + 1} из ${vars.position.total}: ${vars.moduleTitle}`,
      vars.instructions ? `Пожелания преподавателя: ${vars.instructions}` : '',
      '',
      'Узлы знаний и атомы-улики:',
      vars.nodesText,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  schema: LessonResultSchema,
  temperature: 0.5,
  maxTokens: 4000,
});

// ---------- Формат входа для моделей (и для mock-правил) ----------

export interface PromptAtom {
  id: number;
  text: string;
}

/** `[12] текст` — по атому на строку. Формат разбирает и mock-провайдер. */
export function renderAtomsForPrompt(atoms: PromptAtom[]): string {
  return atoms.map((atom) => `[${atom.id}] ${atom.text.replace(/\s+/g, ' ').trim()}`).join('\n');
}

export const ATOM_LINE = /^\[(\d+)\]\s+(.+)$/;

export function parseAtomsFromPrompt(text: string): PromptAtom[] {
  const atoms: PromptAtom[] = [];
  for (const line of text.split('\n')) {
    const match = ATOM_LINE.exec(line.trim());
    if (match) atoms.push({ id: Number(match[1]), text: match[2] ?? '' });
  }
  return atoms;
}

export interface PromptNode {
  id: string;
  title: string;
  statement: string;
  type: string;
  misconceptions: string[];
  evidence: PromptAtom[];
}

/** Узлы модуля для промпта урока: заголовок, утверждение, заблуждения и атомы-улики. */
export function renderNodesForPrompt(nodes: PromptNode[]): string {
  return nodes
    .map((node) => {
      const lines = [
        `## ${node.id}: ${node.title} (${node.type})`,
        `Утверждение: ${node.statement}`,
      ];
      if (node.misconceptions.length > 0)
        lines.push(`Заблуждения: ${node.misconceptions.join('; ')}`);
      lines.push('Атомы:', renderAtomsForPrompt(node.evidence));
      return lines.join('\n');
    })
    .join('\n\n');
}

const NODE_HEADER = /^## ([^:]+): (.+?) \(([A-Z_]+)\)$/;

export function parseNodesFromPrompt(text: string): Array<{ id: string; title: string }> {
  const nodes: Array<{ id: string; title: string }> = [];
  for (const line of text.split('\n')) {
    const match = NODE_HEADER.exec(line.trim());
    if (match) nodes.push({ id: match[1] ?? '', title: match[2] ?? '' });
  }
  return nodes;
}

// ---------- Mock-провайдер: детерминированные ответы для dev/тестов ----------

const lastUser = (req: AiChatRequest) =>
  [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

const byPrompt = (id: string) => (req: AiChatRequest) =>
  req.metadata?.promptId?.startsWith(`${id}@`) ?? false;

function firstSentence(text: string, max = 60): string {
  const cut = text.split(/[.!?]/)[0]?.trim() ?? text;
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

/** Правила mock-провайдера для пайплайна: валидный JSON по схемам, зависящий от входа. */
export const courseBuilderMockRules: MockResponseRule[] = [
  {
    match: byPrompt(topicMaterialPrompt.id),
    content: (req) => {
      const text = lastUser(req);
      const topic = /Тема \/ практика: (.+)/.exec(text)?.[1]?.trim() ?? 'Тема занятия';
      const short = firstSentence(topic, 50);
      const sections = ['Введение', 'Основные понятия', 'Порядок действий', 'Практика'].map(
        (heading, i) => ({
          heading: `${heading}: ${short}`,
          paragraphs: [
            `${heading}. ${short} — это тема занятия; здесь важно понять, зачем она нужна и где применяется (часть ${i + 1}).`,
            `Ключевое правило раздела «${heading}»: действуй по шагам и проверяй результат после каждого шага.`,
            `Пример к разделу «${heading}»: разбери простой случай, затем усложни условие и повтори.`,
          ],
        }),
      );
      const material: TopicMaterial = { title: short, sections };
      return JSON.stringify(material);
    },
  },
  {
    match: byPrompt(surveyPrompt.id),
    content: (req) => {
      const atoms = parseAtomsFromPrompt(lastUser(req));
      const nodes: SurveyResult['nodes'] = [];
      for (let i = 0; i < atoms.length; i += 2) {
        const pair = atoms.slice(i, i + 2);
        const head = pair[0]!;
        nodes.push({
          title: firstSentence(head.text, 40),
          statement: head.text,
          type: (['CONCEPT', 'FACT', 'PROCEDURE', 'EXAMPLE'] as const)[nodes.length % 4]!,
          atomIds: pair.map((a) => a.id),
          importance: nodes.length % 3 === 0 ? 3 : 2,
          misconceptions:
            nodes.length % 2 === 0 ? [`Неверно: «${firstSentence(head.text, 30)}» — всегда`] : [],
        });
      }
      const result: SurveyResult = { nodes };
      return JSON.stringify(result);
    },
  },
  {
    match: byPrompt(lessonPrompt.id),
    content: (req) => {
      const text = lastUser(req);
      const nodes = parseNodesFromPrompt(text);
      const atoms = parseAtomsFromPrompt(text);
      const title = /: (.+)$/m.exec(text.split('\n')[0] ?? '')?.[1] ?? 'Урок';
      const first = nodes[0]?.title ?? title;
      const second = nodes[1]?.title ?? first;
      const result: LessonResult = {
        summary: `Урок «${title}»: ${nodes.map((n) => n.title).join(', ') || first}.`,
        blocks: [
          {
            kind: 'TEXT',
            title: first,
            markdown: `## ${first}\n\n${atoms.map((a) => a.text).join('\n\n') || 'Материал урока.'}`,
          },
          {
            kind: 'QUIZ',
            title: `Проверь себя: ${first}`,
            questions: [
              {
                text: `Что такое «${first}»?`,
                options: [
                  atoms[0]?.text.slice(0, 80) ?? 'Верное определение',
                  'Неверный вариант 1',
                  'Неверный вариант 2',
                  'Неверный вариант 3',
                ],
                correctIndexes: [0],
                explanation: 'Смотри первый абзац урока.',
              },
              {
                text: `Как связаны «${first}» и «${second}»?`,
                options: [
                  'Не связаны',
                  'Второе следует из первого',
                  'Первое отменяет второе',
                  'Это одно и то же',
                ],
                correctIndexes: [1],
              },
            ],
          },
          {
            kind: 'FILL_GAPS',
            title: 'Вставь пропущенное',
            text: `Ключевое понятие урока — {{${first}}}. Оно связано с {{${second}}}.`,
          },
          {
            kind: 'PRACTICE',
            title: `Практика: ${first}`,
            instructions: `Примени «${first}» на своём примере и опиши, что получилось.`,
          },
        ],
      };
      return JSON.stringify(result);
    },
  },
];
