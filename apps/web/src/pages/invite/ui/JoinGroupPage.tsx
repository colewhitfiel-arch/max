import type { GroupInvitePreview } from '@edu/contracts';
import {
  AlertIcon,
  Button,
  Card,
  CheckIcon,
  IconTile,
  ListRow,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ClubIcon } from '@/entities/club';
import { useGroupInvitePreview, useJoinGroup } from '@/entities/group';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { weekdayName } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';
import { useMaxBridge } from '@/shared/max';
import { QueryError } from '@/shared/ui';
import { InviteLayout, InviteSkeleton, InviteState, NotStudentHint } from './InviteParts';

/** Карточка группы по ссылке: кружок с иконкой, кто ведёт, расписание, цена — и «Вступить». */
function GroupCard({
  invite,
  join,
}: {
  invite: GroupInvitePreview;
  join: ReturnType<typeof useJoinGroup>;
}) {
  const { t, i18n } = useTranslation('invite');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const bridge = useMaxBridge();
  const navigate = useNavigate();
  const { group } = invite;
  // `/` сам решит, куда дальше: ученик без онбординга — на онбординг, иначе на главную.
  const leave = () => navigate('/', { replace: true });

  const onJoin = async () => {
    try {
      await join.mutateAsync(invite.token);
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('join.joined', { group: group.title }) });
      leave();
    } catch (cause) {
      toast.show({
        tone: 'danger',
        title: t('join.joinError'),
        description: describeApiError(cause),
      });
    }
  };

  const price =
    invite.price.amountKopecks === 0
      ? t('join.free')
      : tc(`billing.period.${invite.billingPeriod}`, {
          price: formatMoney(invite.price, i18n.language),
        });

  return (
    <Card>
      <Stack gap={5}>
        <Stack gap={3} align="center">
          <ClubIcon category={group.club.category} title={group.club.title} size="xl" />
          <Stack gap={1} align="center">
            <Text variant="caption" tone="muted" align="center">
              {tc(`clubCategory.${group.club.category}`)}
            </Text>
            <Text variant="title" align="center">
              {group.title}
            </Text>
            <Text variant="small" tone="muted" align="center">
              {[
                t('join.teacher', { teacher: fullName(group.teacher.user) }),
                t('join.students', { count: invite.studentsCount }),
                price,
              ].join(' · ')}
            </Text>
          </Stack>
          {invite.description && (
            <Text variant="small" align="center">
              {invite.description}
            </Text>
          )}
        </Stack>

        <Stack gap={2}>
          <Text variant="caption" tone="muted">
            {t('join.schedule')}
          </Text>
          {invite.schedule.length === 0 ? (
            <Text variant="small">{t('join.noSchedule')}</Text>
          ) : (
            <Card padding="none">
              {invite.schedule.map((rule) => (
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
          <Button
            fullWidth
            loading={join.isPending}
            disabled={join.isSuccess}
            onClick={() => void onJoin()}
          >
            {t('join.join')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={join.isPending || join.isSuccess}
            onClick={leave}
          >
            {t('join.later')}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Ученик открыл ссылку: группа, «ты уже в группе» или «ссылка не работает». */
function StudentJoin({ token }: { token: string }) {
  const { t } = useTranslation('invite');
  const query = useGroupInvitePreview(token);
  const join = useJoinGroup();

  if (query.isPending) return <InviteSkeleton />;
  if (query.isError) {
    if (isApiClientError(query.error) && query.error.code === 'NOT_FOUND') {
      return (
        <InviteState
          icon={
            <IconTile tone="warning" size="xl">
              <AlertIcon />
            </IconTile>
          }
          title={t('join.notFound')}
          description={t('join.notFoundHint')}
        />
      );
    }
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }
  // Только что вступил здесь же (кэш уже joined) — карточка остаётся до перехода на главную.
  if (query.data.joined && !join.isPending && !join.isSuccess) {
    return (
      <InviteState
        icon={
          <IconTile tone="success" size="xl">
            <CheckIcon />
          </IconTile>
        }
        title={t('join.alreadyJoined')}
        description={t('join.alreadyJoinedHint')}
      />
    );
  }
  return <GroupCard invite={query.data} join={join} />;
}

/**
 * `/join/:token` — ученик открыл ссылку-приглашение в группу (docs/07 F19): карточка группы →
 * «Вступить в группу» (`POST /student/group-invites/:token/join`) → `/`. Ссылка многоразовая;
 * сброшенная — «Ссылка не работает». Не ученик — подсказка или «Я ученик» прямо здесь.
 */
export function JoinGroupPage() {
  const { t } = useTranslation('invite');
  const { token = '' } = useParams();
  const { me } = useAuth();
  const isStudent = me?.activeRole === 'STUDENT';

  return (
    <InviteLayout title={t('join.title')}>
      {isStudent ? (
        <StudentJoin key={token} token={token} />
      ) : (
        <NotStudentHint
          texts={{
            notStudent: t('join.notStudent'),
            notStudentHint: t('join.notStudentHint'),
            newUser: t('join.newUser'),
            newUserHint: t('join.newUserHint'),
          }}
        />
      )}
    </InviteLayout>
  );
}
