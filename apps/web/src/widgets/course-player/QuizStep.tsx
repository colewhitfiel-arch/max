import type { QuizAnswers, QuizReview, StudentBlockDetail } from '@edu/contracts';
import { Badge, Button, Card, Inline, RefreshIcon, Stack, Text, useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentAssignment, useSubmitAssignment } from '@/entities/assignment';
import { QuizReviewList, useCompleteBlock } from '@/entities/course';
import { QuizAnswer } from '@/features/submit-assignment';
import { describeApiError } from '@/shared/api/errors';

type QuizBlock = Extract<StudentBlockDetail, { type: 'QUIZ' }>;

export interface QuizStepProps {
  block: QuizBlock;
}

/**
 * Тест в плеере курса: ответить → «Проверить» → разбор сразу. Тест, ставший заданием,
 * сдаётся как задание (сервер проверяет его автоматически и засчитывает блок); тест без задания
 * засчитывается напрямую (`complete` с ответами). Не набрал проходной балл — «Ещё раз».
 */
export function QuizStep({ block }: QuizStepProps) {
  const { t } = useTranslation('student');
  const toast = useToast();
  const assignmentId = block.assignment?.id ?? '';
  const assignment = useStudentAssignment(assignmentId, { enabled: !!assignmentId });
  const submit = useSubmitAssignment(assignmentId);
  const complete = useCompleteBlock();
  const [answers, setAnswers] = useState<QuizAnswers>({});
  /** Разбор попытки без задания — приходит в ответе `complete`, а не в блоке. */
  const [localReview, setLocalReview] = useState<QuizReview | null>(null);
  const [retrying, setRetrying] = useState(false);

  const review = retrying ? null : (localReview ?? block.quizReview ?? null);
  const pending = submit.isPending || complete.isPending;
  const answeredAll = block.content.questions.every(
    (question) => (answers[question.id]?.length ?? 0) > 0,
  );
  const attemptsLeft = assignment.data?.attemptsLeft ?? null;

  const onCheck = () => {
    const onError = (error: unknown) =>
      toast.show({ tone: 'danger', title: describeApiError(error) });
    if (assignmentId) {
      submit.mutate(
        { answers },
        {
          onSuccess: () => {
            setRetrying(false);
            setLocalReview(null);
          },
          onError,
        },
      );
    } else {
      complete.mutate(
        { blockId: block.id, body: { answers } },
        {
          onSuccess: (result) => {
            setLocalReview(result.quizReview ?? null);
            setRetrying(false);
          },
          onError,
        },
      );
    }
  };

  if (review) {
    const canRetry = review.score < 100 && attemptsLeft !== 0;
    return (
      <Stack gap={3} data-tour="quiz-review">
        <Card>
          <Stack gap={2} align="center">
            <Text variant="caption" tone="muted">
              {t('player.quiz.result')}
            </Text>
            <Text variant="heading" as="p">
              {review.score}%
            </Text>
            <Badge tone={review.passed ? 'success' : 'warning'}>
              {review.passed
                ? t('player.quiz.passed')
                : t('player.quiz.notPassed', { score: review.passScore })}
            </Badge>
            {attemptsLeft !== null && (
              <Text variant="caption" tone="muted">
                {t('assignments.attemptsLeft', { count: attemptsLeft })}
              </Text>
            )}
          </Stack>
        </Card>
        <QuizReviewList content={block.content} review={review} />
        {canRetry && (
          <Button
            variant="secondary"
            leftIcon={<RefreshIcon />}
            onClick={() => {
              setAnswers({});
              setRetrying(true);
            }}
          >
            {t('player.quiz.retry')}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={3} data-tour="quiz-answer">
      <QuizAnswer
        content={block.content}
        value={answers}
        onChange={setAnswers}
        disabled={pending}
      />
      <Inline gap={2} align="center">
        <Button loading={pending} disabled={!answeredAll} onClick={onCheck}>
          {t('player.quiz.check')}
        </Button>
        {!answeredAll && (
          <Text variant="caption" tone="muted">
            {t('player.quiz.answerAll')}
          </Text>
        )}
      </Inline>
    </Stack>
  );
}
