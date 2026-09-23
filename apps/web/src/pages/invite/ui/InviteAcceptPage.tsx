import type { ParentInvite } from '@edu/contracts';
import {
  AlertIcon,
  AppLayout,
  Avatar,
  Button,
  Card,
  CheckIcon,
  EmptyState,
  IconTile,
  LinkIcon,
  PageHeader,
  Screen,
  Skeleton,
  Stack,
  Text,
  UsersIcon,
  useToast,
} from '@edu/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAcceptParentInvite, useParentInvite } from '@/entities/student';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { roleHomePath } from '@/shared/auth/role-routes';
import { formatDate } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';
import { QueryError } from '@/shared/ui';

/** Кнопка «На главную» активной роли (без роли — выбор роли). */
function GoHomeButton() {
  const { t } = useTranslation('invite');
  const { me } = useAuth();
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      onClick={() => navigate(roleHomePath(me?.activeRole), { replace: true })}
    >
      {t('goHome')}
    </Button>
  );
}

/** Итоговое состояние приглашения (принято / истекло / не найдено): иконка, текст, «На главную». */
function InviteState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={action ?? <GoHomeButton />}
    />
  );
}

/** Скелет карточки приглашения. */
function InviteSkeleton() {
  return (
    <Card>
      <Stack gap={4} align="center" aria-busy="true">
        <Skeleton height={80} width={80} round />
        <Skeleton height={24} width="80%" />
        <Skeleton height={40} />
        <Skeleton height={48} />
      </Stack>
    </Card>
  );
}

/** Карточка ожидающего приглашения: кто зовёт, что увидит, «Подтвердить» / «Не сейчас». */
function PendingInvite({
  invite,
  accept,
  onFailed,
}: {
  invite: ParentInvite;
  accept: ReturnType<typeof useAcceptParentInvite>;
  onFailed: () => void;
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
  // Своё только что принятое приглашение (кэш уже ACCEPTED) — держим карточку до перехода.
  const acceptedHere = accept.isPending || accept.isSuccess;
  if (invite.status === 'ACCEPTED' && !acceptedHere) {
    return (
      <InviteState
        icon={
          <IconTile tone="success" size="xl">
            <CheckIcon />
          </IconTile>
        }
        title={t('alreadyAccepted')}
        description={t('alreadyAcceptedHint')}
      />
    );
  }
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
  return <PendingInvite invite={invite} accept={accept} onFailed={() => void query.refetch()} />;
}

/**
 * Ссылку открыли не из роли ученика: подсказка и переключение, если роль ученика есть.
 * Новый пользователь без ролей (ребёнок впервые в приложении) — «Я ученик»: роль добавляется
 * здесь же, без ухода на выбор роли, и страница сразу покажет приглашение.
 */
function NotStudentHint() {
  const { t } = useTranslation('invite');
  const { me, switchRole, addRole } = useAuth();
  const toast = useToast();
  const [switching, setSwitching] = useState(false);
  const canSwitch = me?.roles.includes('STUDENT') ?? false;
  const isNewUser = !me || me.needsRoleSetup || me.roles.length === 0;

  const onSwitch = async () => {
    setSwitching(true);
    try {
      // После смены (или добавления) роли страница сама покажет приглашение (activeRole = STUDENT).
      if (canSwitch) await switchRole('STUDENT');
      else await addRole('STUDENT');
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: t(canSwitch ? 'switchError' : 'becomeStudentError'),
        description: describeApiError(error),
      });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <InviteState
      icon={
        <IconTile tone="info" size="xl">
          <UsersIcon />
        </IconTile>
      }
      title={t(isNewUser ? 'newUser' : 'notStudent')}
      description={t(isNewUser ? 'newUserHint' : 'notStudentHint')}
      action={
        canSwitch || isNewUser ? (
          <Button loading={switching} onClick={() => void onSwitch()}>
            {t(canSwitch ? 'switchToStudent' : 'becomeStudent')}
          </Button>
        ) : undefined
      }
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
    <AppLayout header={<PageHeader title={t('title')} />}>
      <AppLayout.Content>
        <Screen fill>
          <Stack grow justify="center">
            {isStudent ? <StudentInvite key={token} token={token} /> : <NotStudentHint />}
          </Stack>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
