/**
 * Условие задания и ответ ученика для экранов «Задания» родителя и преподавателя
 * (`HomeworkTaskDetail`). Чистые функции: данные приносят публичные сервисы assignments
 * и courses, здесь только сборка текста.
 */
import type { CodeSnippet, CourseBlock, HomeworkTask, HomeworkTaskDetail } from '@edu/contracts';
import type { StudentAnswerFact, StudentAssignmentFact } from '../assignments/assignments.service';

/** Условие: описание задания, иначе текст блока курса, иначе название. */
export function statementOf(fact: StudentAssignmentFact, block: CourseBlock | undefined): string {
  if (fact.description?.trim()) return fact.description.trim();
  switch (block?.type) {
    case 'HOMEWORK':
    case 'PRACTICE':
      return block.content.instructions;
    case 'QUESTION':
      return block.content.prompt;
    case 'QUIZ':
      return block.content.questions.map((question, i) => `${i + 1}. ${question.text}`).join('\n');
    case 'TEXT':
      return block.content.markdown;
    default:
      return fact.title;
  }
}

/** Ответ ученика: свободный текст или выбранные варианты QUIZ; null — не сдавал. */
export function answerOf(
  answer: StudentAnswerFact | undefined,
  block: CourseBlock | undefined,
): string | null {
  if (!answer) return null;
  if (answer.text?.trim()) return answer.text.trim();
  if (!answer.answers) return null;
  if (block?.type === 'QUIZ') {
    const chosen = answer.answers as Record<string, string[]>;
    const lines = block.content.questions.flatMap((question, index) => {
      const picked = chosen[question.id];
      if (!Array.isArray(picked) || picked.length === 0) return [];
      const texts = picked.map(
        (id) => question.options.find((option) => option.id === id)?.text ?? id,
      );
      return [`${index + 1}. ${texts.join(', ')}`];
    });
    return lines.length > 0 ? lines.join('\n') : null;
  }
  const free = answer.answers as { text?: string };
  return free.text?.trim() || null;
}

/** Эталон показывается только после проверки — до неё он подсказка. */
export function correctAnswerOf(
  answer: StudentAnswerFact | undefined,
  block: CourseBlock | undefined,
): string | null {
  if (!answer?.isGraded || !block) return null;
  if (block.type === 'QUESTION') return block.content.expectedAnswer ?? null;
  if (block.type === 'QUIZ') {
    return block.content.questions
      .map((question, index) => {
        const texts = question.correctOptionIds.map(
          (id) => question.options.find((option) => option.id === id)?.text ?? id,
        );
        return `${index + 1}. ${texts.join(', ')}`;
      })
      .join('\n');
  }
  return null;
}

/** Фрагмент кода в условии: в модели данных его пока нет (docs/04 §4.4). */
export const codeOf = (): CodeSnippet | null => null;

export function toTaskDetail(
  task: HomeworkTask,
  fact: StudentAssignmentFact,
  answer: StudentAnswerFact | undefined,
  block: CourseBlock | undefined,
): HomeworkTaskDetail {
  return {
    ...task,
    statement: statementOf(fact, block),
    code: codeOf(),
    answer: answerOf(answer, block),
    correctAnswer: correctAnswerOf(answer, block),
    score: answer?.isGraded ? (answer.score ?? null) : null,
    maxScore: fact.maxScore,
  };
}
