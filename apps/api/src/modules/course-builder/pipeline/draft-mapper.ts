import {
  type CourseDraftBlock,
  type CourseDraftModule,
  CourseDraftModuleSchema,
} from '@edu/contracts';
import type { LessonBlock, LessonResult } from '@edu/ai';

/**
 * Ответ модели (упрощённая схема урока) → блоки курса контракта. Идентификаторы вариантов,
 * passScore, оценки времени — проставляет код, не модель (ADR «модель отдаёт только payload»).
 */

const OPTION_IDS = 'abcdef';
const QUIZ_PASS_SCORE = 60;

/** Заголовок по умолчанию, если модель оставила title пустым. */
const FALLBACK_TITLES: Record<LessonBlock['kind'], string> = {
  TEXT: 'Теория',
  QUIZ: 'Проверь себя',
  FILL_GAPS: 'Заполни пропуски',
  FLASHCARDS: 'Карточки',
  PRACTICE: 'Практика',
  HOMEWORK: 'Домашнее задание',
  QUESTION: 'Вопрос',
};

/** «Блок 2. Практика» → «Практика»: модель любит нумеровать блоки вопреки инструкции. */
const BLOCK_PREFIX = /^(?:блок|часть|раздел|шаг)\s*\d+[.:)]?\s*[-–—]?\s*/i;

function titleOf(block: LessonBlock): string {
  const title = block.title.trim().replace(BLOCK_PREFIX, '').trim();
  return title.length > 0 ? title : FALLBACK_TITLES[block.kind];
}

const GAP = /\{\{([^}]*)\}\}/g;
const GAP_PLACEHOLDERS = new Set(['ответ', 'answer', 'слово', 'термин', 'пропуск', '...', '…', '']);

/**
 * Пропуски `{{слово}}`: убираем markdown-жирность вокруг, выкидываем предложения, где вместо слова
 * стоит заглушка «ответ». Возвращает null, если ни одного настоящего пропуска не осталось.
 */
export function normalizeGapsText(text: string): string | null {
  const sentences = text
    .replace(/\*\*\s*(\{\{[^}]*\}\})\s*\*\*/g, '$1')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const kept = sentences.filter((sentence) => {
    const gaps = [...sentence.matchAll(GAP)].map((m) => (m[1] ?? '').trim().toLowerCase());
    return gaps.length > 0 && gaps.every((gap) => !GAP_PLACEHOLDERS.has(gap));
  });
  return kept.length > 0 ? kept.join(' ') : null;
}

function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 120) + 1);
}

export function mapLessonBlock(block: LessonBlock): CourseDraftBlock | null {
  switch (block.kind) {
    case 'TEXT':
      return {
        type: 'TEXT',
        title: titleOf(block),
        content: { markdown: block.markdown },
        estimatedMinutes: readingMinutes(block.markdown),
        isRequired: true,
      };
    case 'QUIZ': {
      const questions = block.questions.flatMap((q, qi) => {
        const options = q.options.slice(0, OPTION_IDS.length).map((text, i) => ({
          id: OPTION_IDS[i]!,
          text,
        }));
        const correct = [...new Set(q.correctIndexes)]
          .filter((i) => i >= 0 && i < options.length)
          .map((i) => OPTION_IDS[i]!);
        if (options.length < 2 || correct.length === 0) return [];
        return [
          {
            id: `q${qi + 1}`,
            text: q.text,
            options,
            correctOptionIds: correct,
            ...(q.explanation ? { explanation: q.explanation } : {}),
            multiple: correct.length > 1,
          },
        ];
      });
      if (questions.length === 0) return null;
      return {
        type: 'QUIZ',
        title: titleOf(block),
        content: { questions, passScore: QUIZ_PASS_SCORE },
        estimatedMinutes: Math.max(2, Math.ceil(questions.length * 1.5)),
        isRequired: true,
      };
    }
    case 'FILL_GAPS': {
      const text = normalizeGapsText(block.text);
      if (!text) return null;
      return {
        type: 'INTERACTIVE',
        title: titleOf(block),
        content: { kind: 'FILL_GAPS', data: { text } },
        estimatedMinutes: 4,
        isRequired: false,
      };
    }
    case 'FLASHCARDS':
      return {
        type: 'INTERACTIVE',
        title: titleOf(block),
        content: { kind: 'FLASHCARDS', data: { cards: block.cards } },
        estimatedMinutes: Math.max(2, block.cards.length),
        isRequired: false,
      };
    case 'PRACTICE':
      return {
        type: 'PRACTICE',
        title: titleOf(block),
        content: { instructions: block.instructions, submissionType: 'TEXT' },
        estimatedMinutes: 15,
        isRequired: true,
      };
    case 'HOMEWORK':
      return {
        type: 'HOMEWORK',
        title: titleOf(block),
        content: { instructions: block.instructions, submissionType: 'BOTH' },
        estimatedMinutes: 30,
        isRequired: true,
      };
    case 'QUESTION':
      return {
        type: 'QUESTION',
        title: titleOf(block),
        content: {
          prompt: block.prompt,
          ...(block.expectedAnswer ? { expectedAnswer: block.expectedAnswer } : {}),
        },
        estimatedMinutes: 5,
        isRequired: true,
      };
  }
}

/** Меньше этого объёма теории в уроке — модель её фактически не написала. */
const MIN_THEORY_CHARS = 200;

export interface LessonFallback {
  /** Теория, собранная кодом из узлов и атомов-улик модуля (всегда опирается на источник). */
  theoryMarkdown?: string;
}

export function mapLesson(
  title: string,
  lesson: LessonResult,
  sourceRefs: string[],
  fallback: LessonFallback = {},
): CourseDraftModule {
  const summary = lesson.summary.trim() || title;
  const blocks = lesson.blocks.map(mapLessonBlock).filter((b): b is CourseDraftBlock => b !== null);
  // Урок без теории — не урок: если модель её не написала (или отделалась строкой), теорию
  // собирает код из узлов и атомов модуля — это всегда текст источника, а не выдумка.
  const theoryChars = blocks
    .filter((b) => b.type === 'TEXT')
    .reduce((sum, b) => sum + (b.type === 'TEXT' ? b.content.markdown.length : 0), 0);
  if (theoryChars < MIN_THEORY_CHARS) {
    const markdown = fallback.theoryMarkdown ?? `## ${title}\n\n${summary}`;
    blocks.unshift({
      type: 'TEXT',
      title,
      content: { markdown },
      estimatedMinutes: readingMinutes(markdown),
      isRequired: true,
    });
  }
  return CourseDraftModuleSchema.parse({ title, summary, sourceRefs, blocks });
}

/** Теория «от кода»: узлы модуля с утверждениями и атомами-уликами под ними. */
export function theoryFromNodes(
  nodes: Array<{ title: string; statement: string; evidence: Array<{ text: string }> }>,
): string {
  return nodes
    .map((node) => {
      const facts = node.evidence.map((atom) => `- ${atom.text.trim()}`).join('\n');
      return `### ${node.title}\n\n${node.statement.trim()}\n\n${facts}`.trim();
    })
    .join('\n\n');
}
