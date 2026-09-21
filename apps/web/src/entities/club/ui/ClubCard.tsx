import { CLUB_CATEGORY_LABELS, type ClubCard as ClubCardDto } from '@edu/contracts';
import { Badge, Card, Inline, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { fullName } from '@/shared/lib/format';
import { formatMoney } from '@/shared/lib/money';

export interface ClubCardProps {
  club: ClubCardDto;
  /** Дополнительная строка (оплата, прогресс). */
  extra?: React.ReactNode;
  onClick?: () => void;
}

/** Карточка кружка: категория, цена, преподаватели, расписание. */
export function ClubCard({ club, extra, onClick }: ClubCardProps) {
  const { i18n } = useTranslation();
  return (
    <Card interactive={!!onClick} onClick={onClick}>
      <Stack gap={2}>
        <Inline justify="between" wrap={false}>
          <Text weight="medium">{club.title}</Text>
          <Badge tone="info">{CLUB_CATEGORY_LABELS[club.category]}</Badge>
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
          {formatMoney(club.price, i18n.language)} / мес.
        </Text>
        {extra}
      </Stack>
    </Card>
  );
}
