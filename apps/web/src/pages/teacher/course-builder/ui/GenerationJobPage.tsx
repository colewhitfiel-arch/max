import type { CourseDraftBlock, GenerationJobDto } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  ChevronDownIcon,
  ChevronUpIcon,
  Inline,
  ListRow,
  markdownToText,
  ProgressBar,
  Screen,
  Stack,
  Tabs,
  Text,
  useToast,
} from '@edu/ui';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { BlockPreview } from '@/entities/course';
import {
  generationStageTone,
  isGenerationRunning,
  useAcceptGenerationJob,
  useCancelGenerationJob,
  useGenerationJob,
  usePublishGeneratedCourse,
} from '@/entities/generation';
import { describeApiError } from '@/shared/api/errors';
import { formatRate } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

function blockPreview(block: CourseDraftBlock, t: TFunction<'teacher'>): string | undefined {
  switch (block.type) {
    case 'TEXT':
      return markdownToText(block.content.markdown).slice(0, 160);
    case 'QUIZ':
      return t('courseBuilder.job.preview.quiz', { count: block.content.questions.length });
    case 'INTERACTIVE':
      return block.content.kind === 'FLASHCARDS'
        ? t('courseBuilder.job.preview.flashcards', { count: block.content.data.cards.length })
        : block.content.kind === 'FILL_GAPS'
          ? t('courseBuilder.job.preview.fillGaps')
          : t('courseBuilder.job.preview.matching');
    case 'PRACTICE':
    case 'HOMEWORK':
      return block.content.instructions.slice(0, 160);
    case 'QUESTION':
      return block.content.prompt.slice(0, 160);
    default:
      return undefined;
  }
}

/** Блок черновика: строка с кратким превью; нажатие раскрывает содержимое целиком (с ответами). */
function DraftBlockRow({ block }: { block: CourseDraftBlock }) {
  const { t } = useTranslation('teacher');
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={block.title}
        subtitle={open ? undefined : blockPreview(block, t)}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        right={
          <Inline gap={1} align="center" wrap={false}>
            <Badge tone="neutral">{t(`common:blockType.${block.type}`)}</Badge>
            {open ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </Inline>
        }
      />
      {open && (
        <Card padding="md">
          <BlockPreview block={block} />
        </Card>
      )}
    </>
  );
}

/**
 * `/teacher/course-builder/:jobId` — прогресс стадий, база знаний и ревью черновика (F8).
 * Готовый черновик публикуется одной кнопкой (принять → опубликовать для группы) или
 * сохраняется черновиком курса, чтобы опубликовать позже.
 */
export function GenerationJobPage() {
  const { jobId = '' } = useParams();
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const toast = useToast();
  const query = useGenerationJob(jobId);
  const accept = useAcceptGenerationJob(jobId);
  const cancel = useCancelGenerationJob(jobId);
  const publish = usePublishGeneratedCourse(jobId);
  const [tab, setTab] = useState('draft');

  const onError = (error: unknown) =>
    toast.show({ tone: 'danger', title: describeApiError(error) });

  const onSaveDraft = () =>
    accept.mutate(undefined, {
      onSuccess: ({ courseId }) => {
        toast.show({ tone: 'success', title: t('courseBuilder.job.accepted') });
        navigate(`/teacher/courses/${courseId}`);
      },
      onError,
    });

  /** Принять черновик и сразу опубликовать курс для группы: ученики видят его сразу. */
  const onPublish = () =>
    publish.mutate(undefined, {
      onSuccess: ({ courseId }) => {
        toast.show({ tone: 'success', title: t('courseBuilder.job.published') });
        navigate(`/teacher/courses/${courseId}`);
      },
      onError,
    });

  const renderJob = (job: GenerationJobDto) => {
    const running = isGenerationRunning(job.stage);
    const knowledge = job.knowledge ?? null;
    // Пока черновика нет (стадии до READY), показываем базу знаний — вкладка «Черновик» недоступна.
    const activeTab = job.draft ? tab : 'knowledge';
    const busy = publish.isPending || accept.isPending;
    return (
      <Stack gap={4}>
        <Card data-tour="generation-progress">
          <Stack gap={2}>
            <Inline justify="between" align="center" wrap={false}>
              <Text weight="medium">{t(`courseBuilder.stage.${job.stage}`)}</Text>
              <Badge tone={generationStageTone(job.stage)}>{job.progress}%</Badge>
            </Inline>
            <ProgressBar
              value={job.progress}
              tone={
                job.stage === 'FAILED' ? 'danger' : job.stage === 'CANCELLED' ? 'neutral' : 'info'
              }
              label={t('courseBuilder.job.progress')}
            />
            <Text variant="caption" tone="muted">
              {t(`courseBuilder.stageHint.${job.stage}`)}
            </Text>
            {job.error && (
              <Text tone="danger" role="alert">
                {job.error}
              </Text>
            )}
            <Text variant="caption" tone="muted">
              {t(`courseBuilder.source.${job.sourceKind ?? 'MATERIALS'}`)}
              {job.materials.length > 0 && `: ${job.materials.map((m) => m.fileName).join(', ')}`}
            </Text>
            {job.topic && (
              <Text variant="caption" tone="muted">
                {job.topic}
              </Text>
            )}
            <Stack gap={2} data-tour={job.stage === 'READY' ? 'generation-publish' : undefined}>
              {job.stage === 'READY' && (
                <>
                  <Button fullWidth loading={publish.isPending} disabled={busy} onClick={onPublish}>
                    {t('courseBuilder.job.publish')}
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={accept.isPending}
                    disabled={busy}
                    onClick={onSaveDraft}
                  >
                    {t('courseBuilder.job.accept')}
                  </Button>
                </>
              )}
              {job.stage === 'ACCEPTED' && job.courseId && (
                <Button fullWidth onClick={() => navigate(`/teacher/courses/${job.courseId}`)}>
                  {t('courseBuilder.job.openCourse')}
                </Button>
              )}
              {running && (
                <Button
                  variant="secondary"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate(undefined, { onError })}
                >
                  {t('courseBuilder.job.cancel')}
                </Button>
              )}
            </Stack>
          </Stack>
        </Card>

        {(job.draft || knowledge) && (
          <Tabs
            fitted
            value={activeTab}
            onChange={setTab}
            items={[
              { key: 'draft', label: t('courseBuilder.job.tabDraft'), disabled: !job.draft },
              {
                key: 'knowledge',
                label: t('courseBuilder.job.tabKnowledge'),
                disabled: !knowledge,
              },
            ]}
          />
        )}

        {activeTab === 'draft' && job.draft && (
          <Stack gap={3} data-tour="generation-draft">
            <Stack gap={1}>
              <Text variant="title">{job.draft.title}</Text>
              {job.draft.description && <Text tone="muted">{job.draft.description}</Text>}
            </Stack>
            {job.draft.modules.map((module, index) => (
              <Stack key={`${module.title}-${index}`} gap={2}>
                <SectionTitle>
                  {index + 1}. {module.title}
                </SectionTitle>
                {module.summary && (
                  <Text variant="caption" tone="muted">
                    {module.summary}
                  </Text>
                )}
                <Card padding="none">
                  {module.blocks.map((block, blockIndex) => (
                    <DraftBlockRow key={`${block.title}-${blockIndex}`} block={block} />
                  ))}
                </Card>
              </Stack>
            ))}
          </Stack>
        )}

        {activeTab === 'knowledge' && knowledge && (
          <Stack gap={3}>
            <Card>
              <Stack gap={1}>
                <Text weight="medium">{t('courseBuilder.job.knowledgeTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {t('courseBuilder.job.knowledgeStats', {
                    atoms: knowledge.stats.atomsTotal,
                    nodes: knowledge.nodes.length,
                    coverage: formatRate(knowledge.stats.coverage),
                    rejected: knowledge.stats.nodesRejected,
                  })}
                </Text>
              </Stack>
            </Card>
            {knowledge.plan.map((module, index) => (
              <Stack key={`${module.title}-${index}`} gap={2}>
                <SectionTitle>
                  {index + 1}. {module.title}
                </SectionTitle>
                <Card padding="none">
                  {module.nodeIds
                    .map((id) => knowledge.nodes.find((n) => n.id === id))
                    .filter((n): n is NonNullable<typeof n> => !!n)
                    .map((node) => (
                      <ListRow
                        key={node.id}
                        title={node.title}
                        subtitle={`${node.statement} · [${node.atomIds.join(', ')}]`}
                        right={
                          <Badge tone="neutral">{t(`common:knowledgeNodeType.${node.type}`)}</Badge>
                        }
                      />
                    ))}
                </Card>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    );
  };

  return (
    <>
      <ScreenHeader
        title={query.data?.targetTitle ?? query.data?.draft?.title ?? t('courseBuilder.job.title')}
        back="/teacher/course-builder"
      />
      <Screen>
        <AsyncState query={query}>{renderJob}</AsyncState>
      </Screen>
    </>
  );
}
