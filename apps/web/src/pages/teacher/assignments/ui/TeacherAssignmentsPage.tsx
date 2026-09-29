import type { TeacherAssignmentCard, TeacherAssignmentsFilter } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  ClipboardListIcon,
  EmptyState,
  GraduationCapIcon,
  Screen,
  SegmentedControl,
  Stack,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AssignmentCard, useTeacherAssignments } from '@/entities/assignment';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { submissionTone } from '../model';

const FILTERS: TeacherAssignmentsFilter[] = ['open', 'closed'];

/**
 * `/teacher/assignments` — задания преподавателя (`GET /teacher/assignments?status`) и две
 * основные вещи, которые он делает с этого экрана: задать ДЗ (генерация в курс группы) и
 * отметить посещаемость. Это единственная точка входа в конструктор курса.
 */
export function TeacherAssignmentsPage() {
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const [status, setStatus] = useState<TeacherAssignmentsFilter>('open');
  const query = useTeacherAssignments({ status });

  /** Кому задание: всей группе или перечисленным ученикам. */
  const audience = (assignment: TeacherAssignmentCard) =>
    assignment.studentIds.length > 0
      ? t('assignments.forStudents', { count: assignment.studentIds.length })
      : t('assignments.forGroup');

  return (
    <>
      <ScreenHeader title={t('assignments.title')} bell />
      <Screen fill>
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
          empty={
            <EmptyState title={t('assignments.empty')} description={t('assignments.emptyHint')} />
          }
        >
          {(page) => (
            <Card padding="none" data-tour="teacher-assignments">
              {page.items.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  right={
                    assignment.publishedAt ? (
                      <Badge tone={submissionTone(assignment)}>
                        {t('assignments.submitted', {
                          submitted: assignment.submittedCount,
                          students: assignment.studentsCount,
                        })}
                      </Badge>
                    ) : (
                      <Badge>{t('assignments.draft')}</Badge>
                    )
                  }
                  subtitleExtra={audience(assignment)}
                />
              ))}
            </Card>
          )}
        </AsyncState>

        {/* Действия экрана прижаты к низу: до них дотягивается большой палец. */}
        <Stack gap={2} justify="end" grow>
          <Stack gap={2} data-tour="teacher-assignment-actions">
            <Button
              fullWidth
              size="lg"
              leftIcon={<ClipboardListIcon />}
              onClick={() => navigate('/teacher/assignments/new')}
            >
              {t('assignments.actions.assign')}
            </Button>
            <Button
              fullWidth
              size="lg"
              variant="secondary"
              leftIcon={<GraduationCapIcon />}
              onClick={() => navigate('/teacher/attendance')}
            >
              {t('assignments.actions.attendance')}
            </Button>
          </Stack>
        </Stack>
      </Screen>
    </>
  );
}
