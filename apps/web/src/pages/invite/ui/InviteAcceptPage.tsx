import type { ParentInvite } from '@edu/contracts';
import {
  AlertIcon,
  Avatar,
  Button,
  Card,
  CheckIcon,
  IconTile,
  LinkIcon,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAcceptParentInvite, useParentInvite } from '@/entities/student';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { formatDate } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';
import { QueryError } from '@/shared/ui';
import { InviteLayout, InviteSkeleton, InviteState, NotStudentHint } from './InviteParts';

/** Карточка ожидающего приглашения: кто зовёт, что увидит, «Подтвердить» / «Не сейчас». */
function PendingInvite({
  invite,
  accept,
  onFailed,
  onConflict,
}: {
  invite: ParentInvite;
  accept: ReturnType<typeof useAcceptParentInvite>;
  onFailed: () => void;
  /** CONFLICT: ребёнок уже привязан к родителю или приглашение принято другим аккаунтом. */
  onConflict: () => void;
}) {
  const { t, i18n } = useTranslation('invite');
  const toast = useToast();
  const bridge = useMaxBridge();
  const navigate = useNavigate();
  const parentName = fullName(invite.parent);
  // `/` сам решит, куда дальше: ученик без онбординга — на онбординг, иначе на главную.
  const leave = () => navigate('/', { replace: true });

  // mutateAsync: колбэки mutate() не вызываются, если карточка успела размонтироваться.
  const onAccept = async () => {
    try {
      const result = await accept.mutateAsync(invite.token);
      bridge.haptic('success');
      toast.show({ tone: 'success', title: t('accepted', { parent: fullName(result.parent) }) });
      leave();
    } catch (error) {
      // Конфликт — не сбой: вместо «данные изменились» экран покажет итоговое состояние.
      if (isApiClientError(error) && error.code === 'CONFLICT') {
        onConflict();
        return;
      }
      toast.show({ tone: 'danger', title: t('acceptError'), description: describeApiError(error) });
      // Приглашение могли принять с другого аккаунта или оно истекло — покажем актуальный статус.
      onFailed();
    }
  };

  return (
    <Card>
      <Stack gap={5}>
        <Stack gap={4} align="center">
          <Avatar name={parentName} src={invite.parent.avatarUrl} size="xl" ring />
          <Stack gap={2} align="center">
            <Text variant="title" align="center">
              {t('request', { parent: parentName })}
            </Text>
            <Text variant="small" tone="muted" align="center">
              {t('requestHint', { date: formatDate(invite.expiresAt, i18n.language) })}
            </Text>
          </Stack>
        </Stack>
        <Stack gap={2}>
          <Button
            fullWidth
            loading={accept.isPending}
            disabled={accept.isSuccess}
            onClick={() => void onAccept()}
          >
            {t('confirm')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={accept.isPending || accept.isSuccess}
            onClick={leave}
          >
            {t('later')}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Ученик открыл ссылку: грузим приглашение и показываем его по статусу. */
function StudentInvite({ token }: { token: string }) {
  const { t } = useTranslation('invite');
  const query = useParentInvite(token);
  const accept = useAcceptParentInvite();
  const [conflict, setConflict] = useState(false);

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
          title={t('notFound')}
          description={t('notFoundHint')}
        />
      );
    }
    return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  }

  const invite = query.data;
  // После конфликта ждём актуальный статус: принято другим аккаунтом или ребёнок уже привязан.
  if (conflict && query.isFetching) return <InviteSkeleton />;
  // Своё только что принятое приглашение (кэш уже ACCEPTED) — держим карточку до перехода.
  const acceptedHere = accept.isPending || accept.isSuccess;
  if (invite.status === 'ACCEPTED' && !acceptedHere) {
    // Связь есть — ссылку принял сам ученик. Нет — её использовал другой ученик или родитель
    // потом отвязал ребёнка: «всё готово» было бы неправдой, нужна новая ссылка.
    return (
      <InviteState
        icon={
          invite.alreadyLinked ? (
            <IconTile tone="success" size="xl">
              <CheckIcon />
            </IconTile>
          ) : (
            <IconTile tone="warning" size="xl">
              <LinkIcon />
            </IconTile>
          )
        }
        title={t('alreadyAccepted')}
        description={t(invite.alreadyLinked ? 'alreadyAcceptedHint' : 'alreadyUsedHint')}
      />
    );
  }
  const alreadyLinked = (
    <InviteState
      icon={
        <IconTile tone="success" size="xl">
          <CheckIcon />
        </IconTile>
      }
      title={t('alreadyLinked')}
      description={t('alreadyLinkedHint')}
    />
  );
  if (conflict) return alreadyLinked;
  if (invite.status === 'EXPIRED') {
    return (
      <InviteState
        icon={
          <IconTile tone="warning" size="xl">
            <LinkIcon />
          </IconTile>
        }
        title={t('expired')}
        description={t('expiredHint')}
      />
    );
  }
  // Сервер заранее сообщил, что связь с этим родителем уже есть: принимать нечего (иначе 409).
  if (invite.alreadyLinked && !acceptedHere) return alreadyLinked;
  return (
    <PendingInvite
      invite={invite}
      accept={accept}
      onFailed={() => void query.refetch()}
      onConflict={() => {
        setConflict(true);
        void query.refetch();
      }}
    />
  );
}

/**
 * `/invite/:token` — ребёнок открыл ссылку-приглашение родителя из MAX (F14): карточка
 * «{{parent}} хочет следить за твоими успехами» → `POST /student/parent-invites/:token/accept`
 * → `/` (онбординг ученика, если не пройден, иначе `/student`). Новый пользователь без ролей
 * становится учеником прямо здесь. Истёкшее / принятое / чужое приглашение — понятное сообщение.
 */
export function InviteAcceptPage() {
  const { t } = useTranslation('invite');
  const { token = '' } = useParams();
  const { me } = useAuth();
  const isStudent = me?.activeRole === 'STUDENT';

  return (
    <InviteLayout title={t('title')}>
      {isStudent ? (
        <StudentInvite key={token} token={token} />
      ) : (
        <NotStudentHint
          texts={{
            notStudent: t('notStudent'),
            notStudentHint: t('notStudentHint'),
            newUser: t('newUser'),
            newUserHint: t('newUserHint'),
          }}
        />
      )}
    </InviteLayout>
  );
}
