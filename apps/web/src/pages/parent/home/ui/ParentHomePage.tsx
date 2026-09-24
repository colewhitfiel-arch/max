import {
  Button,
  EmptyState,
  HeartCarousel,
  PlusIcon,
  Screen,
  ScoopPanel,
  Skeleton,
  Stack,
  VisuallyHidden,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { shortName, useChildren } from '@/entities/student';
import { AddChildSheet } from '@/features/link-child';
import { PARENT_WALLET_PATH } from '@/shared/lib/parent-paths';
import { fullName } from '@/shared/lib/format';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import { useUiStore } from '@/shared/store/ui-store';
import { QueryError } from '@/shared/ui';
import { ParentHomeHeader } from '@/widgets/parent-home-header';
import { ParentHomeHomework } from '@/widgets/parent-home-homework';
import { ParentHomeSchedule } from '@/widgets/parent-home-schedule';

/** Раздел профиля родителя с предложениями кружков («Добавить кружок»). */
const OFFERS_PATH = '/parent/profile#offers';

/**
 * `/parent` — главная родителя по макету Figma: аватар и кошелёк (→ пополнение), дети-сердца
 * (свайп выбирает ребёнка, «+» — добавить по ссылке или коду), под вогнутой панелью —
 * расписание выбранного ребёнка как у ученика и круги «Выполненные задания». Без детей —
 * только «+» и приглашение добавить ребёнка; расписание и задания не запрашиваются (F9).
 */
export function ParentHomePage() {
  const { t } = useTranslation('parent-home');
  const navigate = useNavigate();
  const childrenQuery = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const [addOpen, setAddOpen] = useState(false);

  // Только подтверждённые связи: по ожидающей сервер отвечает 403 (как в тьюторе и профиле).
  const children = (childrenQuery.data?.items ?? []).filter(
    (child) => child.linkStatus === 'ACTIVE',
  );
  const selected = children.find((child) => child.student.id === selectedChildId) ?? null;
  const openAdd = () => setAddOpen(true);

  let hearts;
  if (childrenQuery.isPending) hearts = <Skeleton height={150} aria-busy="true" />;
  else if (childrenQuery.isError)
    hearts = (
      <QueryError error={childrenQuery.error} onRetry={() => void childrenQuery.refetch()} />
    );
  else
    hearts = (
      <HeartCarousel
        aria-label={t('children.label')}
        items={children.map((child) => ({
          key: child.student.id,
          name: fullName(child.student.user),
          label: shortName(child.student.user) || t('common:user.noName'),
          src: child.student.user.avatarUrl,
        }))}
        value={selected?.student.id ?? null}
        onChange={setSelectedChildId}
        onAdd={openAdd}
        addLabel={t('children.add')}
      />
    );

  let panel = null;
  if (selected) {
    panel = (
      <Stack gap={6}>
        <ParentHomeSchedule
          key={selected.student.id}
          studentId={selected.student.id}
          onAddClub={() => navigate(OFFERS_PATH)}
        />
        <ParentHomeHomework studentId={selected.student.id} />
      </Stack>
    );
  } else if (childrenQuery.isSuccess && children.length === 0) {
    panel = (
      <EmptyState
        title={t('children.empty')}
        description={t('children.emptyHint')}
        action={
          <Button leftIcon={<PlusIcon />} onClick={openAdd}>
            {t('children.add')}
          </Button>
        }
      />
    );
  }

  return (
    <Screen gap={4} fill>
      <VisuallyHidden as="h1">{t('title')}</VisuallyHidden>
      <ParentHomeHeader
        onOpenWallet={() => navigate(PARENT_WALLET_PATH, { state: FROM_APP_STATE })}
      />
      {hearts}
      <ScoopPanel grow>{panel}</ScoopPanel>
      <AddChildSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onLinked={setSelectedChildId}
      />
    </Screen>
  );
}
