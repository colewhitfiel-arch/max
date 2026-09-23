import type { ChildBrief, ConversationDto } from '@edu/contracts';
import {
  AiIcon,
  Avatar,
  Button,
  Card,
  CheckIcon,
  EmptyState,
  IconTile,
  ListRow,
  PlusIcon,
  Screen,
  Sheet,
  Skeleton,
  Stack,
  Text,
} from '@edu/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateParentConversation, useParentConversations } from '@/entities/ai';
import { useChildren } from '@/entities/student';
import { AddChildSheet } from '@/features/link-child';
import { fullName } from '@/shared/lib/format';
import { useUiStore } from '@/shared/store/ui-store';
import { QueryError, ScreenHeader } from '@/shared/ui';
import { ParentTutorChat } from './ParentTutorChat';

/** Самый свежий диалог по времени последнего сообщения (без сообщений — по порядку сервера). */
function latestConversation(items: ConversationDto[]): ConversationDto | undefined {
  return [...items].sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))[0];
}

/** Скелет чата: пара пузырей с обеих сторон и поле ввода. */
function ChatSkeleton() {
  return (
    <Screen fill>
      <Stack gap={3} grow justify="end" aria-busy="true">
        <Skeleton height={56} width="70%" />
        <Stack align="end">
          <Skeleton height={40} width="55%" />
        </Stack>
        <Skeleton height={72} width="80%" />
        <Skeleton height={52} />
      </Stack>
    </Screen>
  );
}

/** Подпись в шапке «про ребёнка: …»; если детей несколько — кнопка, открывающая выбор ребёнка. */
function ChildSubtitle({
  items,
  child,
  onChange,
}: {
  items: ChildBrief[];
  child: ChildBrief;
  onChange: (studentId: string) => void;
}) {
  const { t } = useTranslation('parent-tutor');
  const [open, setOpen] = useState(false);
  const label = t('about', { name: fullName(child.student.user) });
  if (items.length < 2) return <>{label}</>;
  return (
    <>
      <Button
        variant="link"
        size="sm"
        underline
        aria-haspopup="dialog"
        title={t('switchChild')}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('childSheet')}>
        <Card padding="none">
          {items.map((item) => {
            const active = item.student.id === child.student.id;
            const name = fullName(item.student.user);
            return (
              <ListRow
                key={item.student.id}
                left={<Avatar name={name} src={item.student.user.avatarUrl} size="sm" />}
                title={name}
                right={
                  active ? (
                    <Text as="span" tone="primary">
                      <CheckIcon />
                    </Text>
                  ) : undefined
                }
                chevron={false}
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setOpen(false);
                  onChange(item.student.id);
                }}
              />
            );
          })}
        </Card>
      </Sheet>
    </>
  );
}

/**
 * `/parent/tutor` — ИИ-тьютор для родителя (F15): один непрерывный чат о выбранном ребёнке.
 * Берём самый свежий диалог о ребёнке, а если его нет — создаём. Тьютор говорит с родителем
 * о посещениях, домашних заданиях и прогрессе ребёнка (промпт `tutor.parent` на сервере).
 */
export function ParentTutorPage() {
  const { t } = useTranslation('parent-tutor');
  const childrenQuery = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const [addOpen, setAddOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Говорить можно только о подтверждённых детях: по ожидающей связи сервер ответит 403.
  const children = useMemo(
    () => (childrenQuery.data?.items ?? []).filter((item) => item.linkStatus === 'ACTIVE'),
    [childrenQuery.data],
  );
  const child = children.find((item) => item.student.id === selectedChildId) ?? children[0];
  const studentId = child?.student.id ?? null;

  const conversations = useParentConversations(studentId);
  const create = useCreateParentConversation();
  // Guard от повторного создания по ребёнку (StrictMode вызывает эффекты дважды).
  const requestedRef = useRef(new Set<string>());
  // Ошибки создания — по ребёнку: общие create.error/variables перетирает создание диалога
  // о другом ребёнке, и при возврате к первому без этого остался бы вечный скелет.
  const [createErrors, setCreateErrors] = useState<Record<string, unknown>>({});

  const latest = conversations.data ? latestConversation(conversations.data.items) : undefined;
  const created = create.variables === studentId ? create.data : undefined;
  const conversationId = latest?.id ?? created?.id;
  const createError = studentId ? createErrors[studentId] : undefined;

  useEffect(() => {
    if (!studentId || !conversations.isSuccess || latest) return;
    if (requestedRef.current.has(studentId)) return;
    requestedRef.current.add(studentId);
    // mutateAsync: отказ приходит, даже если следом создавали диалог о другом ребёнке.
    create.mutateAsync(studentId).catch((error: unknown) => {
      setCreateErrors((prev) => ({ ...prev, [studentId]: error }));
    });
  }, [studentId, conversations.isSuccess, latest, create]);

  const retryCreate = (id: string) => {
    setCreateErrors(({ [id]: _failed, ...rest }) => rest);
    create.mutateAsync(id).catch((error: unknown) => {
      setCreateErrors((prev) => ({ ...prev, [id]: error }));
    });
  };

  const subtitle = streaming ? (
    t('typing')
  ) : child ? (
    <ChildSubtitle items={children} child={child} onChange={setSelectedChildId} />
  ) : undefined;

  const body = childrenQuery.isPending ? (
    <ChatSkeleton />
  ) : childrenQuery.isError ? (
    <Screen>
      <QueryError error={childrenQuery.error} onRetry={() => void childrenQuery.refetch()} />
    </Screen>
  ) : !child ? (
    <Screen fill>
      <Stack grow justify="center">
        <EmptyState
          icon={
            <IconTile tone="info" size="xl">
              <AiIcon />
            </IconTile>
          }
          title={t('noChildren.title')}
          description={t('noChildren.description')}
          action={
            <Button leftIcon={<PlusIcon />} onClick={() => setAddOpen(true)}>
              {t('noChildren.action')}
            </Button>
          }
        />
      </Stack>
    </Screen>
  ) : conversations.isError ? (
    <Screen>
      <QueryError error={conversations.error} onRetry={() => void conversations.refetch()} />
    </Screen>
  ) : createError !== undefined ? (
    <Screen>
      <QueryError error={createError} onRetry={() => retryCreate(child.student.id)} />
    </Screen>
  ) : conversationId ? (
    <ParentTutorChat
      key={conversationId}
      conversationId={conversationId}
      childName={child.student.user.firstName}
      onStreamingChange={setStreaming}
    />
  ) : (
    <ChatSkeleton />
  );

  return (
    <>
      <ScreenHeader title={t('title')} subtitle={subtitle} bell sticky />
      {body}
      <AddChildSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
