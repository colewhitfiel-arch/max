import type { StudentProfileDto } from '@edu/contracts';
import { Avatar, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { fullName } from '@/shared/lib/format';
import { StudentHomeStats } from '@/widgets/student-home-stats';

export interface StudentProfileHeroProps {
  profile: StudentProfileDto;
}

/** Герой профиля: аватар с кольцом, имя, школа · класс и серия/баллы как на главной. */
export function StudentProfileHero({ profile }: StudentProfileHeroProps) {
  const { t } = useTranslation('student');
  const name = fullName(profile.user);
  const meta = [
    profile.school?.name,
    profile.classLabel && `${t('profile.class')} ${profile.classLabel}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Stack gap={4} align="center">
      <Avatar name={name} src={profile.user.avatarUrl} size="xl" ring />
      <Stack gap={1} align="center">
        <Text variant="title" align="center">
          {name}
        </Text>
        {meta && (
          <Text variant="small" tone="muted" align="center">
            {meta}
          </Text>
        )}
      </Stack>
      <StudentHomeStats streakDays={profile.streakDays} points={profile.points} />
    </Stack>
  );
}
