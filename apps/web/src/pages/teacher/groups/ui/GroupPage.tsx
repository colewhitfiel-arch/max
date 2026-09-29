import {
  Badge,
  Button,
  Card,
  EmptyState,
  Inline,
  LinkIcon,
  ListRow,
  Screen,
  Stack,
  Text,
} from '@edu/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ClubIcon } from '@/entities/club';
import { useTeacherGroup } from '@/entities/group';
import { LessonCard, useTeacherLessons } from '@/entities/lesson';
import { StudentRow } from '@/entities/student';
import { GroupInviteSheet } from '@/features/invite-to-group';
import { isApiClientError } from '@/shared/api/errors';
import { nextDaysPeriod, weekdayName } from '@/shared/lib/dates';
import { formatPercent, formatRate } from '@/shared/lib/format';
import { FROM_APP_STATE, isFromApp } from '@/shared/lib/navigation';
import { teacherStudentPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';
import { shouldOpenInvite } from '../model';

/**
 * `/teacher/groups/:groupId` — `GET /teacher/groups/:id` + занятия на 14 дней и «Пригласить
 * учеников» (ссылка группы, F19; сразу после создания группы шторка открыта). Открыта из
 * приложения (список групп, «Мои группы» в профиле) — «назад» по истории, иначе — к списку групп.
 */
export function GroupPage() {
  const { groupId = '' } = useParams();
  const { t, i18n } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const query = useTeacherGroup(groupId);
  const period = useMemo(() => nextDaysPeriod(14), []);
  const lessons = useTeacherLessons(groupId, period);
  const [inviteOpen, setInviteOpen] = useState(() => shouldOpenInvite(location.state));
  // Чужая (или несуществующая — сервер отдаёт её так же, docs/05) группа — 403. Прочие ошибки
  // («не найдено», «раздел в разработке» — нет ручки) показывает AsyncState (AGENT_GUIDE §3).
  const notFound = isApiClientError(query.error) && query.error.code === 'FORBIDDEN';

  return (
    <>
      <ScreenHeader
        title={query.data?.title ?? t('groups.title')}
        back={isFromApp(location.state) ? true : '/teacher/groups'}
      />
      <Screen>
        {notFound ? (
          <EmptyState
            title={t('groups.notFoundTitle')}
            description={t('groups.notFoundText')}
            action={
              <Button onClick={() => navigate('/teacher/groups', { replace: true })}>
                {t('groups.toGroups')}
              </Button>
            }
          />
        ) : (
          <>
            <AsyncState query={query}>
              {(group) => (
                <>
                  <Inline gap={3} align="center" wrap={false}>
                    <ClubIcon category={group.club.category} title={group.club.title} size="lg" />
                    <Text variant="caption" tone="muted">
                      {group.club.title} · {t('groups.students', { count: group.studentsCount })} ·{' '}
                      {tc('stats.attendance').toLowerCase()}{' '}
                      {formatRate(group.attendanceRate, i18n.language)}
                    </Text>
                  </Inline>

                  <Button leftIcon={<LinkIcon />} onClick={() => setInviteOpen(true)} fullWidth>
                    {t('groups.invite')}
                  </Button>
                  <GroupInviteSheet
                    open={inviteOpen}
                    onClose={() => setInviteOpen(false)}
                    groupId={group.id}
                    groupTitle={group.title}
                  />

                  <Stack gap={2}>
                    <SectionTitle>{t('groups.schedule')}</SectionTitle>
                    {group.schedule.length === 0 ? (
                      <EmptyState title={t('groups.noSchedule')} />
                    ) : (
                      <Card padding="none">
                        {group.schedule.map((rule) => (
                          <ListRow
                            key={rule.id}
                            title={`${weekdayName(rule.weekday, i18n.language)} ${rule.startTime}–${rule.endTime}`}
                            subtitle={rule.room ?? undefined}
                          />
                        ))}
                      </Card>
                    )}
                  </Stack>

                  <Stack gap={2}>
                    <SectionTitle>{t('groups.studentsList')}</SectionTitle>
                    {group.students.length === 0 ? (
                      <EmptyState
                        title={t('groups.noStudents')}
                        description={t('groups.noStudentsHint')}
                      />
                    ) : (
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
                            onClick={() =>
                              navigate(teacherStudentPaths.student(row.student.id), {
                                state: FROM_APP_STATE,
                              })
                            }
                          />
                        ))}
                      </Card>
                    )}
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
          </>
        )}
      </Screen>
    </>
  );
}
