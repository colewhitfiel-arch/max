import {
  BLOCK_TYPE_META,
  type CourseDraftBlock,
  type GenerationJobDto,
  KNOWLEDGE_NODE_TYPE_LABELS,
} from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  Inline,
  ListRow,
  ProgressBar,
  Screen,
  Stack,
  Tabs,
  Text,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  isGenerationRunning,
  useAcceptGenerationJob,
  useCancelGenerationJob,
  useGenerationJob,
} from '@/entities/generation';
import { describeApiError } from '@/shared/api/errors';
import { formatRate } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

function blockPreview(block: CourseDraftBlock): string | undefined {
  switch (block.type) {
    case 'TEXT':
      return block.content.markdown.replace(/^#+\s*/gm, '').slice(0, 160);
    case 'QUIZ':
      return `${block.content.questions.length} вопр.`;
    case 'INTERACTIVE':
      return block.content.kind === 'FLASHCARDS'
        ? `${block.content.data.cards.length} карточек`
        : block.content.kind === 'FILL_GAPS'
          ? 'пропуски в тексте'
          : 'сопоставление';
    case 'PRACTICE':
    case 'HOMEWORK':
      return block.content.instructions.slice(0, 160);
    case 'QUESTION':
      return block.content.prompt.slice(0, 160);
    default:
      return undefined;
  }
}

/** `/teacher/course-builder/:jobId` — прогресс стадий, база знаний и ревью черновика (F8). */
export function GenerationJobPage() {
  const { jobId = '' } = useParams();
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const toast = useToast();
  const query = useGenerationJob(jobId);
  const accept = useAcceptGenerationJob(jobId);
  const cancel = useCancelGenerationJob(jobId);
  const [tab, setTab] = useState('draft');

  const onAccept = () =>
    accept.mutate(undefined, {
      onSuccess: ({ courseId }) => {
        toast.show({ tone: 'success', title: t('courseBuilder.job.accepted') });
        navigate(`/teacher/courses/${courseId}`);
      },
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });

  const renderJob = (job: GenerationJobDto) => {
    const running = isGenerationRunning(job.stage);
    const knowledge = job.knowledge ?? null;
    return (
      <Stack gap={4}>
        <Card>
          <Stack gap={2}>
            <Inline justify="between" align="center" wrap={false}>
              <Text weight="medium">{t(`courseBuilder.stage.${job.stage}`)}</Text>
              <Badge tone={job.stage === 'FAILED' ? 'danger' : running ? 'info' : 'success'}>
                {job.progress}%
              </Badge>
            </Inline>
            <ProgressBar
              value={job.progress}
              tone={job.stage === 'FAILED' ? 'danger' : 'info'}
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
            <Inline gap={2}>
              {job.stage === 'READY' && (
                <Button loading={accept.isPending} onClick={onAccept}>
                  {t('courseBuilder.job.accept')}
                </Button>
              )}
              {job.stage === 'ACCEPTED' && job.courseId && (
                <Button onClick={() => navigate(`/teacher/courses/${job.courseId}`)}>
                  {t('courseBuilder.job.openCourse')}
                </Button>
              )}
              {running && (
                <Button
                  variant="secondary"
                  loading={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(undefined, {
                      onError: (error) =>
                        toast.show({ tone: 'danger', title: describeApiError(error) }),
                    })
                  }
                >
                  {t('courseBuilder.job.cancel')}
                </Button>
              )}
            </Inline>
          </Stack>
        </Card>

        {(job.draft || knowledge) && (
          <Tabs
            fitted
            value={tab}
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

        {tab === 'draft' && job.draft && (
          <Stack gap={3}>
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
                    <ListRow
                      key={`${block.title}-${blockIndex}`}
                      title={block.title}
                      subtitle={blockPreview(block)}
                      right={<Badge tone="neutral">{BLOCK_TYPE_META[block.type].label}</Badge>}
                    />
                  ))}
                </Card>
              </Stack>
            ))}
          </Stack>
        )}

        {tab === 'knowledge' && knowledge && (
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
                          <Badge tone="neutral">{KNOWLEDGE_NODE_TYPE_LABELS[node.type]}</Badge>
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
