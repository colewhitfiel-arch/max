import type { HomeworkCounts, StudentProfileDto } from '@edu/contracts';
import {
  Button,
  Card,
  CopyIcon,
  EmptyState,
  IconTile,
  Inline,
  LinkIcon,
  Screen,
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useStudentProfile } from '@/entities/dashboard';
import { useMe } from '@/shared/auth/hooks';
import { useMaxBridge } from '@/shared/max';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { ClubHomeworkBand, HomeworkPieCard } from '@/widgets/homework-performance';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { StudentProfileHero } from '@/widgets/student-profile-hero';
import { TrajectoryCard } from '@/widgets/trajectory';

/** Параметр URL с раскрытым кружком: после возврата из задания сетка остаётся открытой. */
const EXPANDED_PARAM = 'club';

const NO_HOMEWORK: HomeworkCounts = { correct: 0, wrong: 0, upcoming: 0 };

/** У ученика «правильно» — больше 75%, как для кристаллов (у родителя — 30%), docs/04 §4.6. */
const STUDENT_FAIL_PERCENT = 75;

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

function ProfileSkeleton() {
  return (
    <Stack gap={6} aria-busy="true">
      <Stack gap={3} align="center">
        <Skeleton width={96} height={96} round />
        <Skeleton width="50%" height={24} />
      </Stack>
      <Skeleton height={159} />
      <Skeleton height={150} />
      <Skeleton height={102} />
    </Stack>
  );
}

/**
 * «Успеваемость» по макету (как у родителя, но «правильно» — больше 75%): дуга посещений недели,
 * круговая диаграмма домашних задач и полосы кружков. «Подробнее» раскрывает сетку заданий
 * кружка (одна за раз, в `?club=`); клетка открывает само задание — доделать или посмотреть
 * оценку и комментарий преподавателя.
 */
function Performance({ profile }: { profile: StudentProfileDto }) {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const titleId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const expandedGroupId = searchParams.get(EXPANDED_PARAM);
  const clubs = profile.clubHomework ?? [];

  const toggle = (groupId: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get(EXPANDED_PARAM) === groupId) next.delete(EXPANDED_PARAM);
        else next.set(EXPANDED_PARAM, groupId);
        return next;
      },
      { replace: true },
    );

  return (
    <Stack as="section" gap={6} aria-labelledby={titleId}>
      <Text as="h2" id={titleId} variant="title" weight="regular" align="center">
        {t('profile.performance')}
      </Text>
      {profile.week && profile.week.length > 0 && <AttendanceWeekCard week={profile.week} />}
      <HomeworkPieCard counts={profile.homework ?? NO_HOMEWORK} />
      {clubs.length === 0 ? (
        <EmptyState
          title={t('profile.homeworkEmpty')}
          description={t('profile.homeworkEmptyHint')}
        />
      ) : (
        <Stack gap={4} role="group" aria-label={t('profile.homeworkByClub')}>
          {clubs.map((item) => (
            <ClubHomeworkBand
              key={item.group.id}
              item={item}
              failPercent={STUDENT_FAIL_PERCENT}
              expanded={expandedGroupId === item.group.id}
              onToggle={() => toggle(item.group.id)}
              onSelectTask={(assignmentId) => navigate(`/student/assignments/${assignmentId}`)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * `/student/profile` — кто я (аватар, имя, школа · класс, серия и кристаллы) и как у меня дела:
 * «Успеваемость» по макету, затем «Моя траектория» (F5) и код для привязки родителя.
 * Данные — `GET /student/profile` (`week`, `homework`, `clubHomework` — как в аналитике родителя).
 */
export function ProfilePage() {
  const { t } = useTranslation('student');
  const me = useMe();
  const query = useStudentProfile();

  return (
    <>
      <ScreenHeader title={t('profile.title')} bell />
      <Screen gap={6}>
        <AsyncState query={query} skeleton={<ProfileSkeleton />}>
          {(profile) => (
            <>
              <StudentProfileHero profile={profile} />
              <Performance profile={profile} />
            </>
          )}
        </AsyncState>

        <TrajectoryCard />

        {me?.student && <LinkCodeCard code={me.student.linkCode} />}
      </Screen>
    </>
  );
}
