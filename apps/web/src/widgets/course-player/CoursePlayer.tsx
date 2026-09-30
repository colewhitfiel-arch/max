import type { StudentBlockDetail, StudentCourseDetail } from '@edu/contracts';
import {
  Badge,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Inline,
  ProgressBar,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  BlockContent,
  useCompleteBlock,
  useOpenBlock,
  useStudentBlock,
  useStudentCourse,
} from '@/entities/course';
import { describeApiError } from '@/shared/api/errors';
import { AsyncState } from '@/shared/ui';
import { QuizStep } from './QuizStep';
import { TaskStep } from './TaskStep';

/** Куда ведут шаги плеера: блок курса и сам курс (после последнего шага — к итогу). */
export const coursePlayerPaths = {
  block: (blockId: string) => `/student/blocks/${blockId}`,
  course: (courseId: string) => `/student/courses/${courseId}`,
};

const TASK_TYPES: ReadonlyArray<StudentBlockDetail['type']> = ['QUESTION', 'PRACTICE', 'HOMEWORK'];

/** Как проходится шаг: тест с разбором, задание со сдачей или материал с кнопкой «Дальше». */
function stepKind(block: StudentBlockDetail): 'quiz' | 'task' | 'content' {
  if (block.type === 'QUIZ') return 'quiz';
  if (!block.assignment || !TASK_TYPES.includes(block.type)) return 'content';
  // ДЗ без сдачи («просто сделай») засчитывается кнопкой, как материал.
  if (block.type === 'HOMEWORK' && block.content.submissionType === 'NONE') return 'content';
  return 'task';
}

interface Step {
  id: string;
  moduleTitle: string;
  completed: boolean;
}

function stepsOf(course: StudentCourseDetail | undefined): Step[] {
  if (!course) return [];
  return course.modules.flatMap((module) =>
    module.blocks.map((block) => ({
      id: block.id,
      moduleTitle: module.title,
      completed: block.progress === 'COMPLETED',
    })),
  );
}

export interface CoursePlayerProps {
  blockId: string;
}

/**
 * Плеер курса ученика (docs/07 F3): шаг за шагом по блокам курса. Сверху — модуль, номер шага
 * и прогресс курса; в середине — теория, интерактив (карточки, пары, пропуски), тест с
 * мгновенной проверкой или задание со сдачей; внизу — «Назад» и «Дальше». Материал засчитывается
 * по «Дальше», тест и задание — сдачей. После последнего шага — к итогу курса.
 */
export function CoursePlayer({ blockId }: CoursePlayerProps) {
  const query = useStudentBlock(blockId);
  const open = useOpenBlock();
  const openedRef = useRef<string | null>(null);
  const block = query.data;
  const course = useStudentCourse(block?.courseId ?? '', { enabled: !!block });

  // Открытие блока отмечается один раз на заход (повторный заход прогресс не сбрасывает).
  useEffect(() => {
    if (!block || block.progress || openedRef.current === blockId) return;
    openedRef.current = blockId;
    open.mutate(blockId);
  }, [blockId, block, open]);

  return (
    <AsyncState query={query}>
      {(data) => <PlayerBody block={data} course={course.data} />}
    </AsyncState>
  );
}

function PlayerBody({
  block,
  course,
}: {
  block: StudentBlockDetail;
  course: StudentCourseDetail | undefined;
}) {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const toast = useToast();
  const complete = useCompleteBlock();

  const steps = stepsOf(course);
  const index = steps.findIndex((step) => step.id === block.id);
  const current = index >= 0 ? steps[index] : undefined;
  const prev = index > 0 ? steps[index - 1] : undefined;
  const next = index >= 0 ? steps[index + 1] : undefined;
  const doneCount = steps.filter((step) => step.completed).length;
  const completed = block.progress?.status === 'COMPLETED';
  const kind = stepKind(block);

  const goNext = () =>
    navigate(next ? coursePlayerPaths.block(next.id) : coursePlayerPaths.course(block.courseId));

  const onNext = () => {
    if (kind !== 'content' || completed) {
      goNext();
      return;
    }
    complete.mutate(
      { blockId: block.id, body: {} },
      {
        onSuccess: goNext,
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  // Тест и задание засчитываются сдачей; до неё «Дальше» — пропуск шага, а не прохождение.
  const skipping = kind !== 'content' && !completed;
  const nextLabel = skipping ? t('player.skip') : next ? t('player.next') : t('player.finish');

  return (
    <Stack gap={4} data-tour="block-player">
      {steps.length > 0 && current && (
        <Stack gap={1}>
          <Inline justify="between" align="center" wrap={false} gap={2}>
            <Text variant="caption" tone="muted" truncate>
              {current.moduleTitle}
            </Text>
            <Text variant="caption" tone="muted">
              {t('player.step', { n: index + 1, total: steps.length })}
            </Text>
          </Inline>
          <ProgressBar
            value={doneCount}
            max={steps.length}
            tone="success"
            size="sm"
            label={t('player.progress', { done: doneCount, total: steps.length })}
          />
        </Stack>
      )}

      <Inline gap={2} align="center">
        <Badge tone="info">{tc(`blockType.${block.type}`)}</Badge>
        {block.estimatedMinutes ? (
          <Text variant="caption" tone="muted">
            {t('courses.minutes', { count: block.estimatedMinutes })}
          </Text>
        ) : null}
        {completed && <Badge tone="success">{t('courses.completed')}</Badge>}
      </Inline>

      {kind === 'quiz' && block.type === 'QUIZ' ? (
        <QuizStep key={block.id} block={block} />
      ) : kind === 'task' && block.assignment ? (
        <TaskStep key={block.id} block={block} assignmentId={block.assignment.id} />
      ) : (
        <BlockContent block={block} card />
      )}

      <Inline justify="between" gap={2} wrap={false}>
        <Button
          variant="ghost"
          leftIcon={<ChevronLeftIcon />}
          disabled={!prev}
          onClick={() => prev && navigate(coursePlayerPaths.block(prev.id))}
        >
          {t('player.prev')}
        </Button>
        <Button
          variant={skipping ? 'secondary' : 'primary'}
          rightIcon={<ChevronRightIcon />}
          loading={complete.isPending}
          onClick={onNext}
          data-tour="player-next"
        >
          {nextLabel}
        </Button>
      </Inline>
    </Stack>
  );
}
