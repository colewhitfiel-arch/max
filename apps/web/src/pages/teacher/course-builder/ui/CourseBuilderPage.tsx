import { Badge, Card, EmptyState, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useGenerationJobs } from '@/entities/course';
import { formatDateTime } from '@/shared/lib/dates';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher/course-builder` — заглушка пайплайна (F8): список задач генерации. */
export function CourseBuilderPage() {
  const { t, i18n } = useTranslation('teacher');
  const jobs = useGenerationJobs();
  return (
    <>
      <ScreenHeader title={t('courseBuilder.title')} back="/teacher/courses" />
      <Screen>
        <Card>
          <Text tone="muted">{t('courseBuilder.description')}</Text>
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
                    title={job.targetTitle ?? job.id}
                    subtitle={formatDateTime(job.createdAt, i18n.language)}
                    right={
                      <Badge tone={job.stage === 'FAILED' ? 'danger' : 'info'}>
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
