import { CLUB_CATEGORY_LABELS } from '@edu/contracts';
import { Avatar, Badge, Button, Card, Inline, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import type { ClubOffer } from '@/entities/club';
import { formatMoney } from '@/shared/lib/money';
import { clubArt } from '@/widgets/parent-home-homework';

/** Сколько символов описания показывать на карточке витрины. */
const DESCRIPTION_LIMIT = 140;

/** Короткое описание: целиком, если влезает, иначе обрезка по границе слова с многоточием. */
function shortDescription(text: string, limit = DESCRIPTION_LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

export interface ClubOfferCardProps {
  offer: ClubOffer;
  onEnroll: () => void;
}

/**
 * Карточка витрины: обложка (без неё — картинка категории, как в кругах главной), название,
 * категория, расписание, цена и «Записать».
 */
export function ClubOfferCard({ offer, onEnroll }: ClubOfferCardProps) {
  const { t, i18n } = useTranslation('parent-profile');
  const { club, enrolled } = offer;
  return (
    <Card>
      <Stack gap={3}>
        <Inline gap={3} wrap={false}>
          <Avatar name={club.title} src={club.coverUrl ?? clubArt(club)} size="lg" />
          <Stack gap={1}>
            <Text as="h3" weight="medium">
              {club.title}
            </Text>
            <Inline gap={2}>
              <Badge tone="info">{CLUB_CATEGORY_LABELS[club.category]}</Badge>
              {enrolled && <Badge tone="success">{t('offers.enrolled')}</Badge>}
            </Inline>
          </Stack>
        </Inline>
        {club.description && (
          <Text variant="small" tone="muted">
            {shortDescription(club.description)}
          </Text>
        )}
        {club.schedulePreview.length > 0 && (
          <Text variant="caption" tone="muted">
            {club.schedulePreview.join(' · ')}
          </Text>
        )}
        <Inline justify="between" wrap={false}>
          <Text weight="bold">
            {t(`offers.period.${club.billingPeriod}`, {
              price: formatMoney(club.price, i18n.language),
            })}
          </Text>
          {!enrolled && (
            <Button
              size="sm"
              onClick={onEnroll}
              aria-label={`${t('offers.enroll')}: ${club.title}`}
            >
              {t('offers.enroll')}
            </Button>
          )}
        </Inline>
      </Stack>
    </Card>
  );
}
