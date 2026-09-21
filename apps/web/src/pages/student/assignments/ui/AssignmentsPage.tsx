import type { StudentAssignmentsFilter } from '@edu/contracts';
import { Card, EmptyState, Screen, SegmentedControl } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AssignmentCard, useStudentAssignments } from '@/entities/assignment';
import { AsyncState, ScreenHeader } from '@/shared/ui';

const FILTERS: StudentAssignmentsFilter[] = ['open', 'done', 'all'];

/** `/student/assignments` — `GET /student/assignments?status`. */
export function AssignmentsPage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const [status, setStatus] = useState<StudentAssignmentsFilter>('open');
  const query = useStudentAssignments({ status });
  return (
    <>
      <ScreenHeader title={t('assignments.title')} back="/student" />
      <Screen>
        <SegmentedControl
          fullWidth
          aria-label={t('assignments.title')}
          value={status}
          onChange={(value) => setStatus(value as StudentAssignmentsFilter)}
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
                  onClick={() => navigate(`/student/assignments/${assignment.id}`)}
                />
              ))}
            </Card>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
