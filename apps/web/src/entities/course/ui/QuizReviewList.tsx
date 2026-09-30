import type { QuizContentForStudent, QuizReview } from '@edu/contracts';
import { Badge, Card, CheckIcon, CloseIcon, Inline, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';

export interface QuizReviewListProps {
  content: QuizContentForStudent;
  review: QuizReview;
}

/**
 * Разбор попытки теста: по каждому вопросу — верно или нет, что выбрал ученик, а у верно
 * отвеченных (или когда попытки кончились) — правильный ответ и пояснение от преподавателя.
 */
export function QuizReviewList({ content, review }: QuizReviewListProps) {
  const { t } = useTranslation('student');
  const byId = new Map(review.questions.map((item) => [item.questionId, item]));
  return (
    <Stack gap={3}>
      {content.questions.map((question, index) => {
        const item = byId.get(question.id);
        if (!item) return null;
        const revealed = item.correctOptionIds !== undefined;
        return (
          <Card key={question.id}>
            <Stack gap={2}>
              <Inline justify="between" align="start" wrap={false} gap={2}>
                <Text weight="medium">
                  {index + 1}. {question.text}
                </Text>
                <Badge tone={item.correct ? 'success' : 'danger'}>
                  {item.correct ? t('player.quiz.correct') : t('player.quiz.wrong')}
                </Badge>
              </Inline>
              <Stack gap={1}>
                {question.options.map((option) => {
                  const picked = item.pickedOptionIds.includes(option.id);
                  const right = item.correctOptionIds?.includes(option.id) ?? false;
                  if (right || picked)
                    return (
                      <Inline key={option.id} gap={1} align="start" wrap={false}>
                        {right ? <CheckIcon size={16} /> : <CloseIcon size={16} />}
                        <Text variant="small" tone={right ? 'success' : 'danger'} weight="medium">
                          {option.text}
                        </Text>
                      </Inline>
                    );
                  return (
                    <Text key={option.id} variant="small" tone="muted">
                      {option.text}
                    </Text>
                  );
                })}
              </Stack>
              {item.explanation && (
                <Text variant="caption" tone="muted">
                  {item.explanation}
                </Text>
              )}
              {!item.correct && !revealed && (
                <Text variant="caption" tone="muted">
                  {t('player.quiz.hintRetry')}
                </Text>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
