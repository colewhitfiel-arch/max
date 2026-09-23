import type { QuizAnswers, QuizContentForStudent } from '@edu/contracts';
import { Card, Checkbox, Field, Radio, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';

export interface QuizAnswerProps {
  content: QuizContentForStudent;
  value: QuizAnswers;
  onChange: (value: QuizAnswers) => void;
  disabled?: boolean;
}

/**
 * Ответы на тест: один вариант — переключатели с общим `name`, несколько — галочки.
 * Правильных вариантов в блоке ученика нет (их вырезает сервер), поэтому подсветки здесь нет.
 */
export function QuizAnswer({ content, value, onChange, disabled }: QuizAnswerProps) {
  const { t } = useTranslation('student');

  const pick = (questionId: string, optionId: string, multiple: boolean, checked: boolean) => {
    const current = value[questionId] ?? [];
    if (!multiple) {
      onChange({ ...value, [questionId]: checked ? [optionId] : [] });
      return;
    }
    const next = checked
      ? [...current, optionId]
      : current.filter((id: string) => id !== optionId);
    onChange({ ...value, [questionId]: next });
  };

  return (
    <Stack gap={4}>
      {content.questions.map((question, index) => {
        const picked = value[question.id] ?? [];
        return (
          <Card key={question.id}>
            <Field
              group
              label={`${index + 1}. ${question.text}`}
              hint={question.multiple ? t('assignments.quiz.multiple') : undefined}
              disabled={disabled}
            >
              <Stack gap={0}>
                {question.options.map((option) => {
                  const checked = picked.includes(option.id);
                  const common = {
                    label: option.text,
                    checked,
                    disabled,
                    onChange: (event: { target: { checked: boolean } }) =>
                      pick(question.id, option.id, question.multiple, event.target.checked),
                  };
                  return question.multiple ? (
                    <Checkbox key={option.id} {...common} />
                  ) : (
                    <Radio key={option.id} name={`quiz-${question.id}`} {...common} />
                  );
                })}
              </Stack>
            </Field>
          </Card>
        );
      })}
      {content.questions.length === 0 && <Text tone="muted">{t('assignments.quiz.empty')}</Text>}
    </Stack>
  );
}
