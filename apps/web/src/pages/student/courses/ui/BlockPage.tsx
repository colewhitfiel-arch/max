import { BLOCK_TYPE_META, type StudentBlockDetail, type VideoContent } from '@edu/contracts';
import { Badge, Button, Card, LinkIcon, ListRow, Screen, Stack, Text, useToast } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useCompleteBlock, useOpenBlock, useStudentBlock } from '@/entities/course';
import { describeApiError } from '@/shared/api/errors';
import { formatDue } from '@/shared/lib/dates';
import { useMaxBridge } from '@/shared/max';
import { AsyncState, ScreenHeader } from '@/shared/ui';

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Видео-блок: ссылка на внешний плеер открывается через MaxBridge (в MAX — `openLink` SDK).
 * Без ссылки (provider `file` до модуля файлов) — «видео недоступно».
 */
function VideoBlock({ content }: { content: VideoContent }) {
  const { t } = useTranslation('student');
  const bridge = useMaxBridge();
  const { url } = content;
  if (!url) return <Text tone="muted">{t('courses.videoUnavailable')}</Text>;
  const host = hostOf(url);
  return (
    <Stack gap={1} align="start">
      <Button variant="link" rightIcon={<LinkIcon />} onClick={() => bridge.openLink(url)}>
        {t('courses.openVideo')}
      </Button>
      {host && (
        <Text variant="caption" tone="muted">
          {host}
        </Text>
      )}
    </Stack>
  );
}

/** Минимальный рендер содержимого блока по типу (полные рендереры — задача W2). */
function BlockContent({ block }: { block: StudentBlockDetail }) {
  const { t } = useTranslation('student');
  switch (block.type) {
    case 'TEXT':
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{block.content.markdown}</Text>;
    case 'VIDEO':
      return <VideoBlock content={block.content} />;
    case 'QUIZ':
      return (
        <Stack gap={2}>
          {block.content.questions.map((question, index) => (
            <Text key={question.id}>
              {index + 1}. {question.text}
            </Text>
          ))}
        </Stack>
      );
    case 'HOMEWORK':
    case 'PRACTICE':
      return <Text>{block.content.instructions}</Text>;
    case 'QUESTION':
      return <Text>{block.content.prompt}</Text>;
    default:
      return <Text tone="muted">{t('courses.contentNotSupported')}</Text>;
  }
}

/** `/student/blocks/:blockId` — блок курса: open при заходе, complete кнопкой (F3). */
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
              <Badge tone="info">{BLOCK_TYPE_META[block.type].label}</Badge>
              <Card>
                <BlockContent block={block} />
              </Card>
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
