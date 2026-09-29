import { Badge, Button, Card, EmptyState, ListRow, PlusIcon, Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ClubIcon } from '@/entities/club';
import { useTeacherGroups } from '@/entities/group';
import { formatDateTime } from '@/shared/lib/dates';
import { formatRate } from '@/shared/lib/format';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** `/teacher/groups` — `GET /teacher/groups` и создание новой группы (кнопка внизу). */
export function GroupsPage() {
  const { t, i18n } = useTranslation('teacher');
  const navigate = useNavigate();
  const query = useTeacherGroups();
  const onCreate = () => navigate(teacherGroupPaths.create, { state: FROM_APP_STATE });
  return (
    <>
      <ScreenHeader title={t('groups.title')} back="/teacher/settings" bell />
      <Screen fill>
        <AsyncState
          query={query}
          isEmpty={(list) => list.items.length === 0}
          empty={<EmptyState title={t('groups.empty')} description={t('groups.emptyHint')} />}
        >
          {(list) => (
            <Card padding="none" data-tour="teacher-groups">
              {list.items.map((group) => (
                <ListRow
                  key={group.id}
                  left={<ClubIcon category={group.club.category} title={group.club.title} />}
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
                  onClick={() =>
                    navigate(teacherGroupPaths.group(group.id), { state: FROM_APP_STATE })
                  }
                />
              ))}
            </Card>
          )}
        </AsyncState>

        {/* Действие экрана прижато к низу: до него дотягивается большой палец. */}
        <Stack gap={2} justify="end" grow>
          <Button fullWidth size="lg" leftIcon={<PlusIcon />} onClick={onCreate}>
            {t('groups.create')}
          </Button>
        </Stack>
      </Screen>
    </>
  );
}
