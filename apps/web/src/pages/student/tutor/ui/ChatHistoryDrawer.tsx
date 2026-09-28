import type { ConversationDto } from '@edu/contracts';
import {
  Button,
  Card,
  Drawer,
  EditIcon,
  EmptyState,
  IconButton,
  ListRow,
  Modal,
  Skeleton,
  Stack,
  Text,
  TrashIcon,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationHistory, useDeleteConversation } from '@/entities/ai';
import { describeApiError } from '@/shared/api/errors';
import { diffCalendarDays } from '@/shared/lib/dates';
import { QueryError } from '@/shared/ui';

type Bucket = 'historyToday' | 'historyYesterday' | 'historyWeek' | 'historyEarlier';

/** Группа истории по дню последнего сообщения — как в ChatGPT: сегодня, вчера, неделя, ранее. */
function bucketOf(conversation: ConversationDto, now: Date): Bucket {
  const offset = conversation.lastMessageAt ? diffCalendarDays(now, conversation.lastMessageAt) : 0;
  if (offset >= 0) return 'historyToday';
  if (offset === -1) return 'historyYesterday';
  if (offset >= -7) return 'historyWeek';
  return 'historyEarlier';
}

function groupByBucket(items: ConversationDto[]) {
  const now = new Date();
  const groups: Array<{ bucket: Bucket; items: ConversationDto[] }> = [];
  for (const item of items) {
    const bucket = bucketOf(item, now);
    const last = groups.at(-1);
    if (last?.bucket === bucket) last.items.push(item);
    else groups.push({ bucket, items: [item] });
  }
  return groups;
}

function HistorySkeleton() {
  return (
    <Stack gap={2} aria-busy="true">
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </Stack>
  );
}

export interface ChatHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Открытый сейчас чат — подсвечен в списке. */
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  /** Чат удалён (если это открытый — страница переходит к новому чату). */
  onDeleted: (conversationId: string) => void;
}

/**
 * История чатов с тьютором (как боковое меню ChatGPT): «Новый чат» сверху, ниже прошлые чаты
 * по группам дат; тап открывает чат, корзина удаляет его (с подтверждением). Данные —
 * `GET /ai/conversations?kind=TUTOR` (хранятся в БД), подгрузка старых — «Показать ещё».
 */
export function ChatHistoryDrawer({
  open,
  onClose,
  activeId,
  onSelect,
  onNewChat,
  onDeleted,
}: ChatHistoryDrawerProps) {
  const { t } = useTranslation('student');
  const toast = useToast();
  const history = useConversationHistory();
  const remove = useDeleteConversation();
  const [pendingDelete, setPendingDelete] = useState<ConversationDto | null>(null);
  const titleOf = (conversation: ConversationDto) =>
    conversation.title?.trim() || t('tutor.untitled');

  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    remove.mutate(target.id, {
      onSuccess: () => {
        setPendingDelete(null);
        toast.show({ tone: 'success', title: t('tutor.deleted') });
        onDeleted(target.id);
      },
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });
  };

  const items = history.data ?? [];

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        side="left"
        title={t('tutor.history')}
        closeLabel={t('common:actions.close')}
      >
        <Stack gap={5}>
          <Button variant="secondary" fullWidth leftIcon={<EditIcon />} onClick={onNewChat}>
            {t('tutor.newChat')}
          </Button>

          {history.isPending ? (
            <HistorySkeleton />
          ) : history.isError ? (
            <QueryError error={history.error} onRetry={() => void history.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t('tutor.historyEmpty')} description={t('tutor.historyEmptyHint')} />
          ) : (
            <Stack gap={4}>
              {groupByBucket(items).map((group) => (
                <Stack
                  key={group.bucket}
                  gap={2}
                  role="group"
                  aria-label={t(`tutor.${group.bucket}`)}
                >
                  <Text variant="caption" tone="muted" weight="medium">
                    {t(`tutor.${group.bucket}`)}
                  </Text>
                  <Card padding="none">
                    {group.items.map((conversation) => {
                      const active = conversation.id === activeId;
                      const title = titleOf(conversation);
                      return (
                        <ListRow
                          key={conversation.id}
                          title={
                            <Text
                              as="span"
                              variant="small"
                              weight={active ? 'bold' : 'regular'}
                              tone={active ? 'primary' : 'default'}
                            >
                              {title}
                            </Text>
                          }
                          aria-current={active ? 'page' : undefined}
                          chevron={false}
                          onClick={() => onSelect(conversation.id)}
                          right={
                            <IconButton
                              size="sm"
                              aria-label={t('tutor.delete', { title })}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingDelete(conversation);
                              }}
                            >
                              <Text as="span" tone="muted">
                                <TrashIcon size={18} />
                              </Text>
                            </IconButton>
                          }
                        />
                      );
                    })}
                  </Card>
                </Stack>
              ))}
              {history.hasNextPage && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {t('tutor.historyMore')}
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Drawer>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('tutor.deleteTitle')}
        closeLabel={t('common:actions.close')}
        footer={
          <Button variant="danger" fullWidth loading={remove.isPending} onClick={confirmDelete}>
            {t('tutor.deleteConfirm')}
          </Button>
        }
      >
        <Text variant="small">
          {pendingDelete ? t('tutor.deleteHint', { title: titleOf(pendingDelete) }) : null}
        </Text>
      </Modal>
    </>
  );
}
