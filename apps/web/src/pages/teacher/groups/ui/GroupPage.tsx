import { Badge, Card, EmptyState, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useTeacherGroup } from '@/entities/group';
import { LessonCard, useTeacherLessons } from '@/entities/lesson';
import { StudentRow } from '@/entities/student';
import { nextDaysPeriod, weekdayName } from '@/shared/lib/dates';
import { formatPercent, formatRate } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher/groups/:groupId` — `GET /teacher/groups/:id` + занятия на 14 дней. */
export function GroupPage() {
  const { groupId = '' } = useParams();
  const { t, i18n } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const query = useTeacherGroup(groupId);
  const period = useMemo(() => nextDaysPeriod(14), []);
  const lessons = useTeacherLessons(groupId, period);

  return (
    <>
      <ScreenHeader title={query.data?.title ?? t('groups.title')} back="/teacher/groups" />
      <Screen>
        <AsyncState query={query}>
          {(group) => (
            <>
              <Text variant="caption" tone="muted">
                {group.club.title} · {t('groups.students', { count: group.studentsCount })} ·{' '}
                {tc('stats.attendance').toLowerCase()}{' '}
                {formatRate(group.attendanceRate, i18n.language)}
              </Text>

              <Stack gap={2}>
                <SectionTitle>{t('groups.schedule')}</SectionTitle>
                <Card padding="none">
                  {group.schedule.map((rule) => (
                    <ListRow
                      key={rule.id}
                      title={`${weekdayName(rule.weekday, i18n.language)} ${rule.startTime}–${rule.endTime}`}
                      subtitle={rule.room ?? undefined}
                    />
                  ))}
                </Card>
              </Stack>

              <Stack gap={2}>
                <SectionTitle>{t('groups.studentsList')}</SectionTitle>
                <Card padding="none">
                  {group.students.map((row) => (
                    <StudentRow
                      key={row.student.id}
                      student={row.student}
                      subtitle={`${tc('stats.attendance')} ${formatRate(row.attendanceRate, i18n.language)} · ${tc('stats.progress')} ${formatPercent(row.progress)}`}
                      right={
                        row.needsAttention.length > 0 ? (
                          <Badge tone="warning">{row.needsAttention[0]}</Badge>
                        ) : (
                          <Badge tone="success">{t('groups.ok')}</Badge>
                        )
                      }
                      onClick={() => navigate(`/teacher/students/${row.student.id}`)}
                    />
                  ))}
                </Card>
              </Stack>
            </>
          )}
        </AsyncState>

        <Stack gap={2}>
          <SectionTitle>{t('groups.lessons')}</SectionTitle>
          <AsyncState
            query={lessons}
            isEmpty={(list) => list.lessons.length === 0}
            empty={<EmptyState title={t('groups.noLessons')} />}
          >
            {(list) => (
              <Card padding="none">
                {list.lessons.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </Card>
            )}
          </AsyncState>
        </Stack>
      </Screen>
    </>
  );
}
