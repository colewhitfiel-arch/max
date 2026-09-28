import type { GroupCard, TeacherStats } from '@edu/contracts';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Grid,
  IconTile,
  ListRow,
  Screen,
  Skeleton,
  Stack,
  StatTile,
  Text,
  UsersIcon,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTeacherHome } from '@/entities/dashboard';
import { useMe } from '@/shared/auth/hooks';
import { formatRate, fullName } from '@/shared/lib/format';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { AsyncState, ListSkeleton, ScreenHeader } from '@/shared/ui';

/**
 * Шапка профиля: крупное фото, имя, «Преподаватель · N групп · M учеников». Пока главная
 * (`GET /teacher/home`) не загрузилась — только роль. Смены фото (`ChangeAvatar`) нет, пока
 * `PUT /me/avatar` отвечает 501 (docs/04, `User.avatarFileId`).
 */
function ProfileHero({ stats }: { stats?: TeacherStats }) {
  const { t } = useTranslation(['teacher-profile', 'common']);
  const me = useMe();
  if (!me) return null;
  const name = fullName(me.user);
  const summary = [
    t('common:roles.TEACHER'),
    stats ? t('hero.groups', { count: stats.groupsCount }) : null,
    stats ? t('hero.students', { count: stats.studentsCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card>
      <Stack gap={4} align="center">
        <Avatar name={name} src={me.user.avatarUrl} size="xl" ring />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {name || t('common:user.noName')}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {summary}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Плитки статистики преподавателя: группы, ученики, средняя посещаемость, требуют внимания. */
function TeacherStatsTiles({ stats }: { stats: TeacherStats }) {
  const { t, i18n } = useTranslation('teacher-profile');
  const attendance = stats.avgAttendanceRate;
  return (
    <Stack as="section" gap={3} aria-labelledby="teacher-stats-title">
      <Text as="h2" id="teacher-stats-title" variant="body" weight="bold">
        {t('stats.title')}
      </Text>
      <Grid columns={2} gap={2}>
        <StatTile label={t('stats.groups')} value={String(stats.groupsCount)} />
        <StatTile label={t('stats.students')} value={String(stats.studentsCount)} />
        <StatTile
          label={t('stats.attendance')}
          value={formatRate(attendance, i18n.language)}
          tone={
            attendance == null
              ? 'neutral'
              : attendance >= 0.8
                ? 'success'
                : attendance >= 0.5
                  ? 'warning'
                  : 'danger'
          }
        />
        <StatTile
          label={t('stats.needsAttention')}
          value={String(stats.needsAttentionCount)}
          tone={stats.needsAttentionCount > 0 ? 'warning' : 'neutral'}
        />
      </Grid>
    </Stack>
  );
}

/** «Мои группы»: кружок, код группы (без кода — название), ученики и посещаемость → группа. */
function MyGroups({ groups }: { groups: GroupCard[] }) {
  const { t, i18n } = useTranslation('teacher-profile');
  const navigate = useNavigate();
  return (
    <Stack as="section" gap={3} aria-labelledby="teacher-groups-title">
      <Text as="h2" id="teacher-groups-title" variant="body" weight="bold">
        {t('groups.title')}
      </Text>
      {groups.length === 0 ? (
        <Card>
          <EmptyState title={t('groups.empty')} description={t('groups.emptyHint')} />
        </Card>
      ) : (
        <Card padding="none">
          {groups.map((group) => (
            <ListRow
              key={group.id}
              left={
                <IconTile tone="warning">
                  <UsersIcon />
                </IconTile>
              }
              title={group.club.title}
              subtitle={[
                group.code ? t('groups.code', { code: group.code }) : group.title,
                t('groups.students', { count: group.studentsCount }),
                formatRate(group.attendanceRate, i18n.language),
              ].join(' · ')}
              right={
                group.needsAttentionCount > 0 ? (
                  <Badge
                    tone="warning"
                    title={t('groups.needsAttention', { count: group.needsAttentionCount })}
                  >
                    {group.needsAttentionCount}
                  </Badge>
                ) : undefined
              }
              chevron
              onClick={() => navigate(`/teacher/groups/${group.id}`, { state: FROM_APP_STATE })}
            />
          ))}
        </Card>
      )}
    </Stack>
  );
}

function ProfileSkeleton() {
  return (
    <Stack gap={5} aria-busy="true">
      <Grid columns={2} gap={2}>
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </Grid>
      <ListSkeleton rows={2} />
    </Stack>
  );
}

/**
 * `/teacher/profile` — фото и имя репетитора, число групп и учеников, плитки статистики и
 * «Мои группы» (→ `/teacher/groups/:id`) — всё из `GET /teacher/home` (F16).
 */
export function TeacherProfilePage() {
  const { t } = useTranslation('teacher-profile');
  const home = useTeacherHome();

  return (
    <>
      <ScreenHeader title={t('title')} bell />
      <Screen gap={5}>
        <ProfileHero stats={home.data?.stats} />
        <AsyncState query={home} skeleton={<ProfileSkeleton />}>
          {(data) => (
            <>
              <TeacherStatsTiles stats={data.stats} />
              <MyGroups groups={data.groups} />
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
