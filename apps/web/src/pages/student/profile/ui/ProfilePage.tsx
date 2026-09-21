import { Avatar, Button, Card, Chip, EmptyState, Inline, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useRefreshTrajectory, useTrajectory } from '@/entities/ai';
import { useStudentProfile } from '@/entities/dashboard';
import { useMe } from '@/shared/auth/hooks';
import { fullName } from '@/shared/lib/format';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';
import { ClubProgressList } from '@/widgets/club-progress-list';
import { StatsTiles } from '@/widgets/stats-tiles';
import { TrajectoryCard } from '@/widgets/trajectory';

/** `/student/profile` — `GET /student/profile` + траектория (F5) + код для родителя. */
export function ProfilePage() {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const me = useMe();
  const query = useStudentProfile();
  const trajectory = useTrajectory();
  const refresh = useRefreshTrajectory();

  return (
    <>
      <ScreenHeader title={t('profile.title')} bell />
      <Screen>
        <AsyncState query={query}>
          {(profile) => (
            <>
              <Card>
                <Inline gap={3} wrap={false}>
                  <Avatar name={fullName(profile.user)} src={profile.user.avatarUrl} size="lg" />
                  <Stack gap={1}>
                    <Text weight="medium">{fullName(profile.user)}</Text>
                    <Text variant="caption" tone="muted">
                      {[
                        profile.school?.name,
                        profile.classLabel && `${t('profile.class')} ${profile.classLabel}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Stack>
                </Inline>
              </Card>

              <StatsTiles stats={profile.stats} />

              {(profile.interests.length > 0 || profile.goals.length > 0) && (
                <Stack gap={2}>
                  {profile.interests.length > 0 && (
                    <>
                      <SectionTitle>{t('profile.interests')}</SectionTitle>
                      <Inline>
                        {profile.interests.map((item) => (
                          <Chip key={item} disabled>
                            {item}
                          </Chip>
                        ))}
                      </Inline>
                    </>
                  )}
                  {profile.goals.length > 0 && (
                    <>
                      <SectionTitle>{t('profile.goals')}</SectionTitle>
                      <Inline>
                        {profile.goals.map((item) => (
                          <Chip key={item} disabled>
                            {item}
                          </Chip>
                        ))}
                      </Inline>
                    </>
                  )}
                </Stack>
              )}

              {profile.clubs.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('profile.clubs')}</SectionTitle>
                  <ClubProgressList clubs={profile.clubs} />
                </Stack>
              )}
            </>
          )}
        </AsyncState>

        <Stack gap={2}>
          <SectionTitle
            action={
              <Button
                variant="ghost"
                size="sm"
                loading={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                {tc('actions.refresh')}
              </Button>
            }
          >
            {t('profile.trajectory')}
          </SectionTitle>
          <AsyncState
            query={trajectory}
            isEmpty={(value) => value === null}
            empty={
              <EmptyState
                title={t('profile.trajectoryEmpty')}
                description={t('profile.trajectoryHint')}
              />
            }
          >
            {(value) => value && <TrajectoryCard trajectory={value} />}
          </AsyncState>
        </Stack>

        {me?.student && (
          <Card>
            <Stack gap={1}>
              <Text variant="caption" tone="muted">
                {t('profile.linkCode')}
              </Text>
              <Text variant="title">{me.student.linkCode}</Text>
              <Text variant="caption" tone="muted">
                {t('profile.linkCodeHint')}
              </Text>
            </Stack>
          </Card>
        )}
      </Screen>
    </>
  );
}
