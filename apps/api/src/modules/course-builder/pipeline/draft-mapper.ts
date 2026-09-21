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

function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 120) + 1);
}

export function mapLessonBlock(block: LessonBlock): CourseDraftBlock | null {
  switch (block.kind) {
    case 'TEXT':
      return {
        type: 'TEXT',
        title: block.title,
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
        title: block.title,
        content: { questions, passScore: QUIZ_PASS_SCORE },
        estimatedMinutes: Math.max(2, Math.ceil(questions.length * 1.5)),
        isRequired: true,
      };
    }
    case 'FILL_GAPS':
      if (!/\{\{[^}]+\}\}/.test(block.text)) return null;
      return {
        type: 'INTERACTIVE',
        title: block.title,
        content: { kind: 'FILL_GAPS', data: { text: block.text } },
        estimatedMinutes: 4,
        isRequired: false,
      };
    case 'FLASHCARDS':
      return {
        type: 'INTERACTIVE',
        title: block.title,
        content: { kind: 'FLASHCARDS', data: { cards: block.cards } },
        estimatedMinutes: Math.max(2, block.cards.length),
        isRequired: false,
      };
    case 'PRACTICE':
      return {
        type: 'PRACTICE',
        title: block.title,
        content: { instructions: block.instructions, submissionType: 'TEXT' },
        estimatedMinutes: 15,
        isRequired: true,
      };
    case 'HOMEWORK':
      return {
        type: 'HOMEWORK',
        title: block.title,
        content: { instructions: block.instructions, submissionType: 'BOTH' },
        estimatedMinutes: 30,
        isRequired: true,
      };
    case 'QUESTION':
      return {
        type: 'QUESTION',
        title: block.title,
        content: {
          prompt: block.prompt,
          ...(block.expectedAnswer ? { expectedAnswer: block.expectedAnswer } : {}),
        },
        estimatedMinutes: 5,
        isRequired: true,
      };
  }
}

export function mapLesson(
  title: string,
  lesson: LessonResult,
  sourceRefs: string[],
): CourseDraftModule {
  const blocks = lesson.blocks.map(mapLessonBlock).filter((b): b is CourseDraftBlock => b !== null);
  // Урок без теории или без единой практики — не урок: гарантируем минимум
  const hasTheory = blocks.some((b) => b.type === 'TEXT');
  if (!hasTheory) {
    blocks.unshift({
      type: 'TEXT',
      title,
      content: { markdown: `## ${title}\n\n${lesson.summary}` },
      estimatedMinutes: 3,
      isRequired: true,
    });
  }
  return CourseDraftModuleSchema.parse({ title, summary: lesson.summary, sourceRefs, blocks });
}
