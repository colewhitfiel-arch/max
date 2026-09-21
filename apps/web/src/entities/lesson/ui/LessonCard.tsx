import type { LessonDto } from '@edu/contracts';
import { Badge, ListRow } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatTime } from '@/shared/lib/dates';

export interface LessonCardProps {
  lesson: LessonDto;
  /** Показывать дату (для списков «ближайшие»), иначе только время. */
  withDate?: boolean;
  onClick?: () => void;
}

/** Занятие в списке: кружок, время, кабинет, статус/посещаемость. Вкладывать в `Card padding="none"`. */
export function LessonCard({ lesson, withDate = true, onClick }: LessonCardProps) {
  const { t, i18n } = useTranslation('common');
  const when = withDate
    ? formatDateTime(lesson.startsAt, i18n.language)
    : `${formatTime(lesson.startsAt, i18n.language)}–${formatTime(lesson.endsAt, i18n.language)}`;
  const subtitle = [when, lesson.room, lesson.topic].filter(Boolean).join(' · ');

  let right: React.ReactNode = null;
  if (lesson.status === 'CANCELLED') right = <Badge tone="danger">{t('lesson.cancelled')}</Badge>;
  else if (lesson.attendance) {
    const tone =
      lesson.attendance === 'PRESENT'
        ? 'success'
        : lesson.attendance === 'ABSENT'
          ? 'danger'
          : 'warning';
    right = <Badge tone={tone}>{t(`lesson.attendance.${lesson.attendance}`)}</Badge>;
  } else if (lesson.status === 'DONE') right = <Badge>{t('lesson.done')}</Badge>;

  return (
    <ListRow
      title={lesson.group.club.title}
      subtitle={subtitle}
      right={right}
      onClick={onClick}
      chevron={onClick ? undefined : false}
    />
  );
}
