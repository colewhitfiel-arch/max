import { Badge, Button, Card, ListRow, Screen, useToast } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { BlockContent, useCompleteBlock, useOpenBlock, useStudentBlock } from '@/entities/course';
import { describeApiError } from '@/shared/api/errors';
import { formatDue } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/**
 * `/student/blocks/:blockId` — блок курса: open при заходе, complete кнопкой (F3).
 * Если у блока есть задание, отвечает ученик на экране задания — там форма сдачи.
 */
export function BlockPage() {
  const { blockId = '' } = useParams();
  const { t, i18n } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const toast = useToast();
  const query = useStudentBlock(blockId);
  const open = useOpenBlock();
  const complete = useCompleteBlock();
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!query.data || openedRef.current === blockId) return;
    if (query.data.progress) return;
    openedRef.current = blockId;
    open.mutate(blockId);
  }, [blockId, open, query.data]);

  const onComplete = () =>
    complete.mutate(
      { blockId, body: {} },
      {
        onSuccess: () => toast.show({ tone: 'success', title: t('courses.completed') }),
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );

  return (
    <>
      <ScreenHeader
        title={query.data?.title ?? t('courses.title')}
        back={query.data ? `/student/courses/${query.data.courseId}` : true}
      />
      <Screen>
        <AsyncState query={query}>
          {(block) => (
            <>
              <Badge tone="info">{tc(`blockType.${block.type}`)}</Badge>
              <BlockContent block={block} card />
              {block.assignment && (
                // Строка, а не кнопка: длинное название переносится, а не режется многоточием.
                <Card padding="none">
                  <ListRow
                    title={block.assignment.title}
                    subtitle={`${tc(`assignment.type.${block.assignment.type}`)} · ${
                      block.assignment.dueAt
                        ? formatDue(block.assignment.dueAt, i18n.language)
                        : tc('assignment.noDue')
                    }`}
                    onClick={() => navigate(`/student/assignments/${block.assignment!.id}`)}
                  />
                </Card>
              )}
              {block.progress?.status === 'COMPLETED' ? (
                <Badge tone="success">{t('courses.completed')}</Badge>
              ) : (
                <Button fullWidth loading={complete.isPending} onClick={onComplete}>
                  {t('courses.complete')}
                </Button>
              )}
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
