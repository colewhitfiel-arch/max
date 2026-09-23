import type { ChildBrief } from '@edu/contracts';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  HeartAvatar,
  Screen,
  Skeleton,
  Stack,
  Text,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useChildren } from '@/entities/student';
import { AddChildSheet } from '@/features/link-child';
import { fullName } from '@/shared/lib/format';
import { useUiStore } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader } from '@/shared/ui';
import { analyticsPaths } from '../paths';

/** Аналитика доступна только по подтверждённой связи: по ожидающей сервер отвечает 403. */
const isActive = (child: ChildBrief) => child.linkStatus === 'ACTIVE';

/** Размер сердца на плитке: две колонки на экране 360–402px. */
const TILE_HEART = 96;

function PickerSkeleton() {
  return (
    <Grid columns={2} gap={3} aria-busy="true">
      <Skeleton height={148} />
      <Skeleton height={148} />
    </Grid>
  );
}

interface ChildTileProps {
  child: ChildBrief;
  selected: boolean;
  onOpen: () => void;
}

/** Плитка ребёнка: сердце с фото (выбранный — зелёное, остальные — бирюзовые) и имя. */
function ChildTile({ child, selected, onOpen }: ChildTileProps) {
  const name = fullName(child.student.user);
  return (
    <Card interactive padding="sm" aria-current={selected || undefined} onClick={onOpen}>
      <Stack gap={2} align="center">
        <HeartAvatar
          aria-hidden="true"
          size={TILE_HEART}
          tone={selected ? 'primary' : 'accent'}
          src={child.student.user.avatarUrl}
          name={name}
        />
        <Text
          variant="small"
          weight="medium"
          align="center"
          tone={selected ? 'primary' : 'default'}
        >
          {name}
        </Text>
      </Stack>
    </Card>
  );
}

/**
 * `/parent/analytics` — переходник «Успеваемость»: выбор ребёнка (плитки-сердца) → его
 * аналитика; без детей — пустое состояние с добавлением по ссылке или коду (AddChildSheet).
 */
export function AnalyticsPickerPage() {
  const { t } = useTranslation('parent-analytics');
  const navigate = useNavigate();
  const query = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);
  const [addOpen, setAddOpen] = useState(false);

  const open = (studentId: string) => {
    setSelectedChildId(studentId);
    navigate(analyticsPaths.child(studentId));
  };

  return (
    <>
      <ScreenHeader title={t('title')} />
      <Screen gap={4}>
        <AsyncState
          query={query}
          skeleton={<PickerSkeleton />}
          isEmpty={(data) => !data.items.some(isActive)}
          empty={
            <EmptyState
              icon={
                <HeartAvatar aria-hidden="true" add tone="plain" size={72} name={t('picker.add')} />
              }
              title={t('picker.emptyTitle')}
              description={t('picker.emptyText')}
              action={<Button onClick={() => setAddOpen(true)}>{t('picker.add')}</Button>}
            />
          }
        >
          {(data) => (
            <Stack gap={4}>
              <Text variant="small" tone="muted" align="center">
                {t('picker.hint')}
              </Text>
              <Grid columns={2} gap={3} role="group" aria-label={t('picker.listLabel')}>
                {data.items.filter(isActive).map((child) => (
                  <ChildTile
                    key={child.student.id}
                    child={child}
                    selected={child.student.id === selectedChildId}
                    onOpen={() => open(child.student.id)}
                  />
                ))}
                <Card interactive padding="sm" onClick={() => setAddOpen(true)}>
                  <Stack gap={2} align="center">
                    <HeartAvatar
                      aria-hidden="true"
                      add
                      tone="plain"
                      size={TILE_HEART}
                      name={t('picker.add')}
                    />
                    <Text variant="small" weight="medium" align="center">
                      {t('picker.add')}
                    </Text>
                  </Stack>
                </Card>
              </Grid>
            </Stack>
          )}
        </AsyncState>
      </Screen>
      {/* Привязали по коду — сразу открываем успеваемость этого ребёнка. */}
      <AddChildSheet open={addOpen} onClose={() => setAddOpen(false)} onLinked={open} />
    </>
  );
}
