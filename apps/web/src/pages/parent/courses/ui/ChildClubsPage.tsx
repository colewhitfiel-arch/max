import { Button, EmptyState, ProgressBar, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { ClubCard, useChildClubs } from '@/entities/club';
import { NoChildState } from '@/features/link-child';
import { formatDateOnly, weekdayName } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { isFromApp } from '@/shared/lib/navigation';
import { PARENT_HOME_PATH } from '@/shared/lib/parent-paths';
import { useSelectedChildId } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/parent/courses` — кружки ребёнка (`GET /parent/children/:id/clubs`) с оплатой и преподавателем. */
export function ChildClubsPage() {
  const { t, i18n } = useTranslation('parent');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const studentId = useSelectedChildId();
  const query = useChildClubs(studentId);

  return (
    <>
      {/* Вне нижнего меню: из настроек — назад по истории, по прямой ссылке — на главную. */}
      <ScreenHeader
        title={t('courses.title')}
        back={isFromApp(location.state) ? true : PARENT_HOME_PATH}
        bell
      />
      <Screen>
        {/* Без выбранного ребёнка запрос выключен (вечный pending) — своё состояние. */}
        {!studentId ? (
          <NoChildState />
        ) : (
          <AsyncState
            query={query}
            isEmpty={(list) => list.items.length === 0}
            empty={<EmptyState title={t('courses.empty')} />}
          >
            {(list) => (
              <Stack gap={3}>
                {list.items.map((item) => (
                  <ClubCard
                    key={item.enrollmentId}
                    club={item.club}
                    extra={
                      <Stack gap={2}>
                        <Text variant="caption">
                          {t('courses.schedule')}:{' '}
                          {item.schedule
                            .map(
                              (rule) =>
                                `${weekdayName(rule.weekday, i18n.language)} ${rule.startTime}–${rule.endTime}`,
                            )
                            .join(', ')}
                        </Text>
                        <ProgressBar
                          value={item.progress.percent}
                          size="sm"
                          label={tc('stats.progress')}
                        />
                        <Text variant="caption" tone={item.paidUntil ? 'success' : 'warning'}>
                          {item.paidUntil
                            ? t('courses.paidUntil', {
                                date: formatDateOnly(item.paidUntil, i18n.language),
                              })
                            : t('courses.notPaid')}
                          {' · '}
                          {t('courses.nextPayment', {
                            date: formatDateOnly(item.nextPaymentAt, i18n.language),
                          })}
                        </Text>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            navigate(`/parent/courses/teacher/${item.group.teacher.id}`)
                          }
                        >
                          {t('courses.teacher')}: {fullName(item.group.teacher.user)}
                        </Button>
                      </Stack>
                    }
                  />
                ))}
              </Stack>
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
