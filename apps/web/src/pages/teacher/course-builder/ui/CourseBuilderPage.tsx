import { Badge, Card, EmptyState, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { generationStageTone, useGenerationJobs } from '@/entities/generation';
import { GenerateCourseForm } from '@/features/generate-course';
import { formatDateTime } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher/course-builder` — запуск генерации (по теме или из файлов) и список задач (F8). */
export function CourseBuilderPage() {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const jobs = useGenerationJobs();

  return (
    <>
      <ScreenHeader title={t('courseBuilder.title')} back="/teacher/assignments" />
      <Screen>
        <Card data-tour="course-builder">
          <Stack gap={3}>
            <Text tone="muted">{t('courseBuilder.description')}</Text>
            <GenerateCourseForm
              onCreated={(jobId) => navigate(`/teacher/course-builder/${jobId}`)}
            />
          </Stack>
        </Card>
        <Stack gap={2}>
          <SectionTitle>{t('courseBuilder.jobs')}</SectionTitle>
          <AsyncState
            query={jobs}
            isEmpty={(page) => page.items.length === 0}
            empty={<EmptyState title={t('courseBuilder.empty')} />}
          >
            {(page) => (
              <Card padding="none">
                {page.items.map((job) => (
                  <ListRow
                    key={job.id}
                    title={
                      job.targetTitle ??
                      job.topic?.slice(0, 60) ??
                      job.materials[0]?.fileName ??
                      job.id
                    }
                    subtitle={`${t(`courseBuilder.source.${job.sourceKind ?? 'MATERIALS'}`)} · ${formatDateTime(job.createdAt, i18n.language)}`}
                    onClick={() => navigate(`/teacher/course-builder/${job.id}`)}
                    right={
                      <Badge tone={generationStageTone(job.stage)}>
                        {t(`courseBuilder.stage.${job.stage}`)}
                      </Badge>
                    }
                  />
                ))}
              </Card>
            )}
          </AsyncState>
        </Stack>
      </Screen>
    </>
  );
}
