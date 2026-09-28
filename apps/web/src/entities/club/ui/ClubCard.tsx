import type { ClubCard as ClubCardDto } from '@edu/contracts';
import { Badge, Card, Inline, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { fullName } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';

export interface ClubCardProps {
  club: ClubCardDto;
  /** Дополнительная строка (оплата, прогресс). */
  extra?: React.ReactNode;
  onClick?: () => void;
  /**
   * Бейдж категории может уйти под длинное название, если вместе они не влезают в ширину
   * (экран 360px: «Программирование на Python» + «Программирование»). По умолчанию — одной
   * строкой, как раньше.
   */
  wrapBadge?: boolean;
}

/** Карточка кружка: категория, цена, преподаватели, расписание. */
export function ClubCard({ club, extra, onClick, wrapBadge = false }: ClubCardProps) {
  const { t, i18n } = useTranslation('common');
  return (
    <Card interactive={!!onClick} onClick={onClick}>
      <Stack gap={2}>
        <Inline justify="between" wrap={wrapBadge} align={wrapBadge ? 'start' : undefined}>
          <Text weight="medium">{club.title}</Text>
          <Badge tone="info">{t(`clubCategory.${club.category}`)}</Badge>
        </Inline>
        <Text variant="caption" tone="muted">
          {club.description}
        </Text>
        {club.schedulePreview.length > 0 && (
          <Text variant="caption">{club.schedulePreview.join(' · ')}</Text>
        )}
        {club.teachers.length > 0 && (
          <Text variant="caption" tone="muted">
            {club.teachers.map((teacher) => fullName(teacher.user)).join(', ')}
          </Text>
        )}
        <Text variant="caption" weight="medium">
          {t(`billing.period.${club.billingPeriod}`, {
            price: formatMoney(club.price, i18n.language),
          })}
        </Text>
        {extra}
      </Stack>
    </Card>
  );
}
