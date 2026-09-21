import type { TeacherAssignmentsFilter } from '@edu/contracts';
import { Badge, Card, EmptyState, Screen, SegmentedControl } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssignmentCard, useTeacherAssignments } from '@/entities/assignment';
import { AsyncState, ScreenHeader } from '@/shared/ui';

const FILTERS: TeacherAssignmentsFilter[] = ['open', 'closed'];

/** `/teacher/assignments` — `GET /teacher/assignments?status` (создание/проверка — задача W9). */
export function TeacherAssignmentsPage() {
  const { t } = useTranslation('teacher');
  const [status, setStatus] = useState<TeacherAssignmentsFilter>('open');
  const query = useTeacherAssignments({ status });
  return (
    <>
      <ScreenHeader title={t('assignments.title')} bell />
      <Screen>
        <SegmentedControl
          fullWidth
          aria-label={t('assignments.title')}
          value={status}
          onChange={(value) => setStatus(value as TeacherAssignmentsFilter)}
          options={FILTERS.map((value) => ({ value, label: t(`assignments.filter.${value}`) }))}
        />
        <AsyncState
          query={query}
          isEmpty={(page) => page.items.length === 0}
          empty={<EmptyState title={t('assignments.empty')} />}
        >
          {(page) => (
            <Card padding="none">
              {page.items.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  right={
                    assignment.publishedAt ? (
                      <Badge
                        tone={
                          assignment.submittedCount > assignment.gradedCount ? 'info' : 'success'
                        }
                      >
                        {t('assignments.submitted', {
                          submitted: assignment.submittedCount,
                          students: assignment.studentsCount,
                        })}
                      </Badge>
                    ) : (
                      <Badge>{t('assignments.draft')}</Badge>
                    )
                  }
                />
              ))}
            </Card>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
