import type {
  FileDto,
  QuizAnswers,
  StudentAssignmentDetail,
  StudentBlockDetail,
  SubmitAssignmentBody,
} from '@edu/contracts';
import { Button, Card, Field, Stack, Text, Textarea, useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubmitAssignment } from '@/entities/assignment';
import { describeApiError } from '@/shared/api/errors';
import { QuizAnswer } from './QuizAnswer';
import { SubmissionFiles } from './SubmissionFiles';

export interface SubmitAssignmentFormProps {
  assignment: StudentAssignmentDetail;
  /** Блок курса, из которого выросло задание: из него берутся вопросы теста и формат сдачи. */
  block: StudentBlockDetail | null;
}

/** Что ученик может приложить к сдаче: зависит от блока, у «простого» задания — текст и файлы. */
function submissionKind(
  assignment: StudentAssignmentDetail,
  block: StudentBlockDetail | null,
): { quiz: boolean; text: boolean; files: boolean } {
  if (block?.type === 'QUIZ') return { quiz: true, text: false, files: false };
  if (block?.type === 'PRACTICE' || block?.type === 'HOMEWORK') {
    const type = block.content.submissionType;
    return {
      quiz: false,
      text: type === 'TEXT' || type === 'BOTH',
      files: type === 'FILE' || type === 'BOTH',
    };
  }
  if (block?.type === 'QUESTION') return { quiz: false, text: true, files: false };
  // Задание без блока (преподаватель задал вручную) и QUIZ-задание без доступного блока.
  return { quiz: false, text: true, files: assignment.type !== 'QUIZ' };
}

/**
 * Сдача задания учеником (docs/07 F7): тест — выбор вариантов, остальное — текст и вложения.
 * Пустую работу отправить нельзя (это же правило проверяет сервер), попытки ограничены
 * `attemptsLeft`. Повторная сдача разрешена, пока попытки остались.
 */
export function SubmitAssignmentForm({ assignment, block }: SubmitAssignmentFormProps) {
  const { t } = useTranslation('student');
  const toast = useToast();
  const submit = useSubmitAssignment(assignment.id);
  const [quiz, setQuiz] = useState<QuizAnswers>({});
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FileDto[]>([]);

  const kind = submissionKind(assignment, block);
  const noAttemptsLeft = assignment.attemptsLeft === 0;
  const answered = Object.values(quiz).some((options) => options.length > 0);
  const filled = (kind.quiz && answered) || text.trim() !== '' || files.length > 0;

  const onSubmit = () => {
    const body: SubmitAssignmentBody = kind.quiz
      ? { answers: quiz }
      : {
          ...(text.trim() ? { text: text.trim() } : {}),
          ...(files.length > 0 ? { fileIds: files.map((file) => file.id) } : {}),
        };
    submit.mutate(body, {
      onSuccess: () => {
        toast.show({ tone: 'success', title: t('assignments.submitted') });
        setQuiz({});
        setText('');
        setFiles([]);
      },
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });
  };

  if (noAttemptsLeft) {
    return (
      <Card>
        <Text tone="muted">{t('assignments.noAttempts')}</Text>
      </Card>
    );
  }

  return (
    <Stack gap={4}>
      {kind.quiz && block?.type === 'QUIZ' && (
        <QuizAnswer
          content={block.content}
          value={quiz}
          onChange={setQuiz}
          disabled={submit.isPending}
        />
      )}
      {kind.text && (
        <Field label={t('assignments.answer')}>
          <Textarea
            rows={5}
            value={text}
            disabled={submit.isPending}
            placeholder={t('assignments.answerPlaceholder')}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      )}
      {kind.files && (
        <SubmissionFiles value={files} onChange={setFiles} disabled={submit.isPending} />
      )}
      <Button fullWidth disabled={!filled} loading={submit.isPending} onClick={onSubmit}>
        {assignment.submission ? t('assignments.resubmit') : t('assignments.submit')}
      </Button>
      {!filled && (
        <Text variant="caption" tone="muted">
          {t('assignments.emptyHint')}
        </Text>
      )}
      {assignment.attemptsLeft != null && (
        <Text variant="caption" tone="muted">
          {t('assignments.attemptsLeft', { count: assignment.attemptsLeft })}
        </Text>
      )}
    </Stack>
  );
}
