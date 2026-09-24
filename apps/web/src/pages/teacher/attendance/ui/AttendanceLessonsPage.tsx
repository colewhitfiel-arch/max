import type { LessonDto } from '@edu/contracts';
import { Badge, Card, EmptyState, ListRow, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { lessonsToMark, useTeacherCalendar } from '@/entities/lesson';
import {
  formatDateTime,
  formatTimeRange,
  lastDaysPeriod,
  nextDaysPeriod,
} from '@/shared/lib/dates';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** Сколько назад и вперёд показывать занятия: две недели долгов и неделя вперёд. */
const DAYS_BACK = 14;
const DAYS_FORWARD = 7;

/**
 * `/teacher/attendance` — выбор занятия для отметки (docs/07 F6, шаг 1).
 * Преподаватель почти всегда отмечает то, что только что прошло, поэтому сверху — сегодняшние
 * занятия, затем прошедшие без отметки (долг), и только потом ближайшие.
 */
export function AttendanceLessonsPage() {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const back = lastDaysPeriod(DAYS_BACK);
  const forward = nextDaysPeriod(DAYS_FORWARD);
  const query = useTeacherCalendar({ from: back.from, to: forward.to });

  const row = (lesson: LessonDto, hint?: string) => (
    <ListRow
      key={lesson.id}
      title={lesson.group.title}
      subtitle={`${formatTimeRange(lesson.startsAt, lesson.endsAt, i18n.language)} · ${
        lesson.topic ?? formatDateTime(lesson.startsAt, i18n.language)
      }`}
      onClick={() => navigate(`/teacher/attendance/${lesson.id}`)}
      right={
        lesson.status === 'DONE' ? (
          <Badge tone="success">{t('attendance.marked')}</Badge>
        ) : (
          <Badge tone={hint === 'overdue' ? 'warning' : 'neutral'}>{t('attendance.toMark')}</Badge>
        )
      }
    />
  );

  return (
    <>
      <ScreenHeader title={t('attendance.title')} back="/teacher/assignments" />
      <Screen>
        <Text tone="muted">{t('attendance.pickLesson')}</Text>
        <AsyncState
          query={query}
          isEmpty={(data) => data.lessons.every((lesson) => lesson.status === 'CANCELLED')}
          empty={
            <EmptyState
              title={t('attendance.emptyLessons')}
              description={t('attendance.emptyLessonsHint')}
            />
          }
        >
          {(data) => {
            const { today, unmarked, upcoming } = lessonsToMark(data.lessons);
            return (
              <Stack gap={4}>
                {today.length > 0 && (
                  <Stack gap={2}>
                    <SectionTitle>{t('attendance.sections.today')}</SectionTitle>
                    <Card padding="none">{today.map((lesson) => row(lesson))}</Card>
                  </Stack>
                )}
                {unmarked.length > 0 && (
                  <Stack gap={2}>
                    <SectionTitle>{t('attendance.sections.unmarked')}</SectionTitle>
                    <Card padding="none">{unmarked.map((lesson) => row(lesson, 'overdue'))}</Card>
                  </Stack>
                )}
                {upcoming.length > 0 && (
                  <Stack gap={2}>
                    <SectionTitle>{t('attendance.sections.upcoming')}</SectionTitle>
                    <Card padding="none">{upcoming.map((lesson) => row(lesson))}</Card>
                  </Stack>
                )}
              </Stack>
            );
          }}
        </AsyncState>
      </Screen>
    </>
  );
}
