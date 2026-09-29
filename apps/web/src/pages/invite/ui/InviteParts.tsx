import {
  AppLayout,
  Button,
  Card,
  IconTile,
  PageHeader,
  Screen,
  Skeleton,
  Stack,
  UsersIcon,
  EmptyState,
  useToast,
} from '@edu/ui';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { describeApiError } from '@/shared/api/errors';
import { useAuth } from '@/shared/auth/hooks';
import { roleHomePath } from '@/shared/auth/role-routes';

/** Кнопка «На главную» активной роли (без роли — выбор роли). */
export function GoHomeButton() {
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
export function InviteState({
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
export function InviteSkeleton() {
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

/** Тексты подсказки «не ученик» — у каждого вида приглашения свои. */
export interface NotStudentTexts {
  notStudent: string;
  notStudentHint: string;
  newUser: string;
  newUserHint: string;
}

/**
 * Ссылку открыли не из роли ученика: подсказка и переключение, если роль ученика есть.
 * Новый пользователь без ролей (ребёнок впервые в приложении) — «Я ученик»: роль добавляется
 * здесь же, без ухода на выбор роли, и страница сразу покажет приглашение.
 */
export function NotStudentHint({ texts }: { texts: NotStudentTexts }) {
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
      title={isNewUser ? texts.newUser : texts.notStudent}
      description={isNewUser ? texts.newUserHint : texts.notStudentHint}
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

/** Каркас страницы приглашения: шапка и карточка по центру экрана. */
export function InviteLayout({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <AppLayout header={<PageHeader title={title} />}>
      <AppLayout.Content>
        <Screen fill>
          <Stack grow justify="center">
            {children}
          </Stack>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
