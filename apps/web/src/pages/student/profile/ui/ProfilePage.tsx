import {
  Button,
  Card,
  CopyIcon,
  HeartIcon,
  IconTile,
  Inline,
  LinkIcon,
  Screen,
  Stack,
  Tag,
  TargetIcon,
  Text,
  useToast,
} from '@edu/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentProfile } from '@/entities/dashboard';
import { useMe } from '@/shared/auth/hooks';
import { useMaxBridge } from '@/shared/max';
import { AsyncState, DashboardSkeleton, ScreenHeader } from '@/shared/ui';
import { ClubProgressList } from '@/widgets/club-progress-list';
import { StudentProfileHero } from '@/widgets/student-profile-hero';
import { StudentProfileStats } from '@/widgets/student-profile-stats';
import { TrajectoryCard } from '@/widgets/trajectory';

/** Секция экрана: заголовок как у карточек главной + содержимое. */
function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text as="h2" variant="body" weight="bold">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

/** Интересы / цели одной карточкой: иконка-маркер + теги. */
function TagsCard({
  icon,
  title,
  items,
  tone,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  tone: 'info' | 'success';
}) {
  return (
    <Card>
      <Stack gap={3}>
        <Inline gap={2} wrap={false}>
          <IconTile tone={tone} size="sm">
            {icon}
          </IconTile>
          <Text as="h2" variant="body" weight="bold">
            {title}
          </Text>
        </Inline>
        <Inline gap={2}>
          {items.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Inline>
      </Stack>
    </Card>
  );
}

/** Код для привязки родителя: крупно, с копированием в буфер. */
function LinkCodeCard({ code }: { code: string }) {
  const { t } = useTranslation('student');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const bridge = useMaxBridge();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('profile.copied') });
    } catch {
      toast.show({ tone: 'warning', title: t('profile.copyFailed') });
    }
  };

  return (
    <Card>
      <Stack gap={3}>
        <Inline gap={2} wrap={false}>
          <IconTile tone="warning" size="sm">
            <LinkIcon />
          </IconTile>
          <Text as="h2" variant="body" weight="bold">
            {t('profile.linkCode')}
          </Text>
        </Inline>
        <Inline justify="between" align="center" wrap={false}>
          <Text variant="heading" as="p" aria-label={`${t('profile.linkCode')}: ${code}`}>
            {code}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<CopyIcon />}
            onClick={() => void onCopy()}
          >
            {tc('actions.copy')}
          </Button>
        </Inline>
        <Text variant="caption" tone="muted">
          {t('profile.linkCodeHint')}
        </Text>
      </Stack>
    </Card>
  );
}

/**
 * `/student/profile` — герой с аватаром и серией/баллами, статистика за 30 дней,
 * интересы и цели, кружки, «Моя траектория» (F5), код для родителя.
 */
export function ProfilePage() {
  const { t } = useTranslation('student');
  const me = useMe();
  const query = useStudentProfile();

  return (
    <>
      <ScreenHeader title={t('profile.title')} bell />
      <Screen gap={5}>
        <AsyncState query={query} skeleton={<DashboardSkeleton />}>
          {(profile) => (
            <>
              <StudentProfileHero profile={profile} />
              <StudentProfileStats stats={profile.stats} />

              {profile.interests.length > 0 && (
                <TagsCard
                  icon={<HeartIcon />}
                  title={t('profile.interests')}
                  items={profile.interests}
                  tone="info"
                />
              )}
              {profile.goals.length > 0 && (
                <TagsCard
                  icon={<TargetIcon />}
                  title={t('profile.goals')}
                  items={profile.goals}
                  tone="success"
                />
              )}

              {profile.clubs.length > 0 && (
                <Section title={t('profile.clubs')}>
                  <ClubProgressList clubs={profile.clubs} />
                </Section>
              )}
            </>
          )}
        </AsyncState>

        <TrajectoryCard />

        {me?.student && <LinkCodeCard code={me.student.linkCode} />}
      </Screen>
    </>
  );
}
