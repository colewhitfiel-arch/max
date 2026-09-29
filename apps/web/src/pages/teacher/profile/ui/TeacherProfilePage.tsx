import type { GroupCard, TeacherStats } from '@edu/contracts';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Grid,
  Inline,
  ListRow,
  PlusIcon,
  Screen,
  Skeleton,
  Stack,
  StatTile,
  Text,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ClubIcon } from '@/entities/club';
import { useTeacherHome } from '@/entities/dashboard';
import { ChangeAvatar } from '@/features/change-avatar';
import { useMe } from '@/shared/auth/hooks';
import { formatRate, fullName } from '@/shared/lib/format';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { TEACHER_SUBJECTS_PATH, teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ListSkeleton, ScreenHeader } from '@/shared/ui';

/**
 * Шапка профиля: крупное фото, имя, «Преподаватель · N групп · M учеников», смена фото.
 * Пока главная (`GET /teacher/home`) не загрузилась — только роль.
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
          {me.teacher?.qualification && (
            <Text variant="small" align="center">
              {me.teacher.qualification}
            </Text>
          )}
        </Stack>
        <ChangeAvatar hasPhoto={Boolean(me.user.avatarUrl)} />
      </Stack>
    </Card>
  );
}

/** «Мои кружки»: что ведёт преподаватель (выбрал сам), с иконками → «Что вы ведёте?». */
function MySubjects() {
  const { t } = useTranslation(['teacher-profile', 'common']);
  const navigate = useNavigate();
  const me = useMe();
  const subjects = me?.teacher?.subjects ?? [];
  const edit = () => navigate(TEACHER_SUBJECTS_PATH, { state: FROM_APP_STATE });
  return (
    <Stack as="section" gap={3} aria-labelledby="teacher-subjects-title">
      <Inline justify="between" align="center" wrap={false}>
        <Text as="h2" id="teacher-subjects-title" variant="body" weight="bold">
          {t('subjects.title')}
        </Text>
        {subjects.length > 0 && (
          <Button variant="ghost" size="sm" onClick={edit}>
            {t('subjects.edit')}
          </Button>
        )}
      </Inline>
      {subjects.length === 0 ? (
        <Card>
          <EmptyState
            title={t('subjects.empty')}
            description={t('subjects.emptyHint')}
            action={<Button onClick={edit}>{t('subjects.pick')}</Button>}
          />
        </Card>
      ) : (
        <Card padding="none">
          {subjects.map((category) => {
            const title = t(`common:clubCategory.${category}`);
            return (
              <ListRow
                key={category}
                left={<ClubIcon category={category} title={title} />}
                title={title}
              />
            );
          })}
        </Card>
      )}
    </Stack>
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
          <EmptyState
            title={t('groups.empty')}
            description={t('groups.emptyHint')}
            action={
              <Button
                leftIcon={<PlusIcon />}
                onClick={() => navigate(teacherGroupPaths.create, { state: FROM_APP_STATE })}
              >
                {t('groups.create')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          {groups.map((group) => (
            <ListRow
              key={group.id}
              left={<ClubIcon category={group.club.category} title={group.club.title} />}
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
              onClick={() => navigate(teacherGroupPaths.group(group.id), { state: FROM_APP_STATE })}
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
 * `/teacher/profile` — фото и имя репетитора, число групп и учеников, «Мои кружки» (выбирает сам,
 * → «Что вы ведёте?»), плитки статистики и «Мои группы» (→ `/teacher/groups/:id`; нет групп —
 * «Новая группа») — статистика и группы из `GET /teacher/home` (F16).
 */
export function TeacherProfilePage() {
  const { t } = useTranslation('teacher-profile');
  const home = useTeacherHome();

  return (
    <>
      <ScreenHeader title={t('title')} bell />
      <Screen gap={5}>
        <ProfileHero stats={home.data?.stats} />
        <MySubjects />
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
