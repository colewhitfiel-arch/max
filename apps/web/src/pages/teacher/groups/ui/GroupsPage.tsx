import { Badge, Card, EmptyState, ListRow, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTeacherGroups } from '@/entities/group';
import { formatDateTime } from '@/shared/lib/dates';
import { formatRate } from '@/shared/lib/format';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/teacher/groups` — `GET /teacher/groups`. */
export function GroupsPage() {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const query = useTeacherGroups();
  return (
    <>
      <ScreenHeader title={t('groups.title')} back="/teacher/settings" bell />
      <Screen>
        <AsyncState
          query={query}
          isEmpty={(list) => list.items.length === 0}
          empty={<EmptyState title={t('groups.empty')} />}
        >
          {(list) => (
            <Card padding="none">
              {list.items.map((group) => (
                <ListRow
                  key={group.id}
                  title={group.title}
                  subtitle={[
                    t('groups.students', { count: group.studentsCount }),
                    formatRate(group.attendanceRate, i18n.language),
                    group.nextLesson
                      ? `${t('groups.nextLesson')}: ${formatDateTime(group.nextLesson.startsAt, i18n.language)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    group.needsAttentionCount > 0 ? (
                      <Badge tone="warning">
                        {t('groups.needsAttention', { count: group.needsAttentionCount })}
                      </Badge>
                    ) : undefined
                  }
                  onClick={() => navigate(`/teacher/groups/${group.id}`, { state: FROM_APP_STATE })}
                />
              ))}
            </Card>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
