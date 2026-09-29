import { CLUB_CATEGORIES, type HomeworkClub } from '@edu/contracts';
import { AppLayout, PlanetMap, type PlanetMapItem } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { clubIcon } from '@/entities/club';
import { diffCalendarDays, formatDate } from '@/shared/lib/dates';
import stars from './assets/stars.png';

/**
 * Звёздное небо из макета на весь экран «Задания» — под шапкой, карточками и меню.
 * Геометрия макета: картинка 1254px на экране 402px (312%), сдвиг −192px по x
 * (22.5% свободного хода) и 61px сверху — над серией звёзд нет; 54% непрозрачности.
 */
export function HomeworkBackdrop() {
  return (
    <AppLayout.Backdrop
      image={stars}
      opacity={0.54}
      size="312% auto"
      position="22.5% 61px"
      repeat="no-repeat"
    />
  );
}

export interface HomeworkMapProps {
  /** Кружки ученика в порядке ближайшего дедлайна (как отдаёт API). */
  clubs: HomeworkClub[];
  /** Открыть ближайшее задание кружка. */
  onOpenAssignment: (assignmentId: string) => void;
  /** Открыть курс кружка — когда открытых заданий не осталось. */
  onOpenClub: (groupId: string) => void;
}

/**
 * Карта заданий по кружкам: планета на кружок, баллы крупно, название под линией;
 * над самым срочным кружком — жёлтая пометка со сроком. Тап по планете — ближайшее задание,
 * а если всё сделано — курс кружка (планета без действия выглядела бы сломанной).
 * Дальше по траектории — серые планеты с замком: предметы, на которые ученик не записан.
 */
export function HomeworkMap({ clubs, onOpenAssignment, onOpenClub }: HomeworkMapProps) {
  const { t, i18n } = useTranslation('student');

  const dueMarker = (dueAt: string | null): string | null => {
    if (!dueAt) return null;
    const now = new Date();
    if (new Date(dueAt).getTime() < now.getTime()) return t('homework.due.overdue');
    const days = diffCalendarDays(now, dueAt);
    if (days === 0) return t('homework.due.today');
    if (days === 1) return t('homework.due.tomorrow');
    // Дата одним куском: пометка под планетой переносится по словам.
    return t('homework.due.date', {
      date: formatDate(dueAt, i18n.language).replace(/\s/g, '\u00a0'),
    });
  };

  const enrolled: PlanetMapItem[] = clubs.map((item, index) => {
    const next = item.nextAssignment;
    // Пометка только у самого срочного кружка (первый в списке) — как в макете.
    const marker = index === 0 && next ? dueMarker(next.dueAt) : null;
    return {
      key: item.group.id,
      image: clubIcon(item.club.category, 'planet'),
      value: item.points,
      label: item.club.title,
      marker,
      title: next
        ? t('homework.planet', {
            club: item.club.title,
            points: t('homework.points', { count: item.points }),
            open: item.openCount,
          })
        : t('homework.planetDone', {
            club: item.club.title,
            points: t('homework.points', { count: item.points }),
          }),
      onClick: next ? () => onOpenAssignment(next.id) : () => onOpenClub(item.group.id),
    };
  });

  const enrolledCategories = new Set(clubs.map((item) => item.club.category));
  const locked: PlanetMapItem[] = CLUB_CATEGORIES.filter(
    (category) => !enrolledCategories.has(category),
  ).map((category) => ({
    key: `locked:${category}`,
    image: clubIcon(category, 'planet'),
    label: t(`common:clubCategory.${category}`),
    title: t('homework.locked', { subject: t(`common:clubCategory.${category}`) }),
    locked: true,
  }));

  return (
    <PlanetMap
      items={[...enrolled, ...locked]}
      grow
      bleed
      aria-label={t('homework.map')}
      data-tour="homework-map"
    />
  );
}
