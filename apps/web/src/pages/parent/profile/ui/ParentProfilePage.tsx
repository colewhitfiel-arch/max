import { Avatar, Card, EmptyState, Screen, Stack, Text, useToast } from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { useClubOffers } from '@/entities/club';
import { useChildren } from '@/entities/student';
import { ChangeAvatar } from '@/features/change-avatar';
import { useMe } from '@/shared/auth/hooks';
import { fullName } from '@/shared/lib/format';
import { useUiStore } from '@/shared/store/ui-store';
import { AsyncState, ListSkeleton, ScreenHeader } from '@/shared/ui';
import { ClubOfferCard } from './ClubOfferCard';

/** Якорь секции витрины: «Добавить кружок» на главной ведёт на `/parent/profile#offers`. */
const OFFERS_ANCHOR = 'offers';

/**
 * Шапка профиля: крупное фото, имя, роль и число детей, смена фото. Число — по списку детей
 * (`activeChildren`, он перечитывается по фокусу): `me.parent.childrenCount` не обновится,
 * когда ребёнок примет приглашение; до загрузки списка — он как запасной вариант.
 */
function ProfileHero({ activeChildren }: { activeChildren?: number }) {
  const { t } = useTranslation('parent-profile');
  const me = useMe();
  if (!me) return null;
  const name = fullName(me.user);
  const title = name || t('common:user.noName');
  const childrenCount = activeChildren ?? me.parent?.childrenCount ?? 0;
  return (
    <Card>
      <Stack gap={4} align="center">
        <Avatar name={name} src={me.user.avatarUrl} size="xl" ring />
        <Stack gap={1} align="center">
          <Text variant="title" align="center">
            {title}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t(`common:roles.${me.activeRole ?? 'PARENT'}`)}
            {' · '}
            {childrenCount > 0 ? t('children', { count: childrenCount }) : t('noChildren')}
          </Text>
        </Stack>
        <ChangeAvatar hasPhoto={Boolean(me.user.avatarUrl)} />
      </Stack>
    </Card>
  );
}

/**
 * `/parent/profile` — фото и имя родителя, витрина «Кружки для ваших детей» (`#offers`):
 * кружки каталога с ценой и «Записать» (пока заглушка — ручки записи нет).
 */
export function ParentProfilePage() {
  const { t } = useTranslation('parent-profile');
  const toast = useToast();
  const { hash } = useLocation();
  const offersRef = useRef<HTMLElement>(null);
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const childrenQuery = useChildren();
  // Отмечаем кружки выбранного ребёнка (иначе первого); по ожидающей связи кружки не отдадут (403).
  const active = childrenQuery.data?.items.filter((item) => item.linkStatus === 'ACTIVE') ?? [];
  const child = active.find((item) => item.student.id === selectedChildId) ?? active[0];
  const offers = useClubOffers(child?.student.id ?? null, !childrenQuery.isPending);

  // Переход с главной по «Добавить кружок»: докручиваем до витрины, когда она отрисована.
  useEffect(() => {
    if (hash !== `#${OFFERS_ANCHOR}` || offers.isPending) return;
    offersRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [hash, offers.isPending]);

  return (
    <>
      <ScreenHeader title={t('title')} bell />
      <Screen gap={5}>
        <ProfileHero activeChildren={childrenQuery.data ? active.length : undefined} />

        <Stack
          as="section"
          ref={offersRef}
          id={OFFERS_ANCHOR}
          gap={3}
          aria-labelledby="parent-offers-title"
        >
          <Stack gap={1}>
            <Text as="h2" id="parent-offers-title" variant="body" weight="bold">
              {t('offers.title')}
            </Text>
            <Text variant="small" tone="muted">
              {child?.student.user.firstName.trim()
                ? t('offers.hintChild', { name: child.student.user.firstName.trim() })
                : t('offers.hint')}
            </Text>
          </Stack>
          <AsyncState
            query={offers}
            skeleton={<ListSkeleton rows={2} />}
            isEmpty={(data) => data.items.length === 0}
            empty={<EmptyState title={t('offers.empty')} description={t('offers.emptyHint')} />}
          >
            {(data) => (
              <Stack gap={3}>
                {data.items.map((offer) => (
                  <ClubOfferCard
                    key={offer.club.id}
                    offer={offer}
                    onEnroll={() => toast.show({ tone: 'info', title: t('offers.enrollSoon') })}
                  />
                ))}
              </Stack>
            )}
          </AsyncState>
        </Stack>
      </Screen>
    </>
  );
}
