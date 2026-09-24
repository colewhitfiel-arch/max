import { CLUB_CATEGORIES, type ClubCategory, type HomeworkClub } from '@edu/contracts';
import { AppLayout, PlanetMap, type PlanetMapItem } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { diffCalendarDays, formatDate } from '@/shared/lib/dates';
import planetArt from './assets/planet-art.png';
import planetChess from './assets/planet-chess.png';
import planetEnglish from './assets/planet-english.png';
import planetMusic from './assets/planet-music.png';
import planetProgramming from './assets/planet-programming.png';
import planetRobotics from './assets/planet-robotics.png';
import planetScience from './assets/planet-science.png';
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

/**
 * Планеты из макета по предмету (категории кружка). Предметы без своей планеты
 * (MATH, SPORT, OTHER) на карту заблокированных не попадают, пока для них нет картинки.
 */
const PLANETS: Partial<Record<ClubCategory, string>> = {
  CHESS: planetChess,
  LANGUAGES: planetEnglish,
  PROGRAMMING: planetProgramming,
  ROBOTICS: planetRobotics,
  ART: planetArt,
  SCIENCE: planetScience,
  MUSIC: planetMusic,
};
const FALLBACK_PLANETS = [planetRobotics, planetProgramming, planetEnglish, planetChess];

export interface HomeworkMapProps {
  /** Кружки ученика в порядке ближайшего дедлайна (как отдаёт API). */
  clubs: HomeworkClub[];
  /** Открыть ближайшее задание кружка. */
  onOpenAssignment: (assignmentId: string) => void;
}

/**
 * Карта заданий по кружкам: планета на кружок, баллы крупно, название под линией;
 * над самым срочным кружком — жёлтая пометка со сроком. Тап по планете — ближайшее задание.
 * Дальше по траектории — серые планеты с замком: предметы, на которые ученик не записан.
 */
export function HomeworkMap({ clubs, onOpenAssignment }: HomeworkMapProps) {
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
      image: PLANETS[item.club.category] ?? FALLBACK_PLANETS[index % FALLBACK_PLANETS.length]!,
      value: item.points,
      label: item.club.title,
      marker,
      title: t('homework.planet', {
        club: item.club.title,
        points: t('homework.points', { count: item.points }),
        open: item.openCount,
      }),
      onClick: next ? () => onOpenAssignment(next.id) : undefined,
    };
  });

  const enrolledCategories = new Set(clubs.map((item) => item.club.category));
  const locked: PlanetMapItem[] = CLUB_CATEGORIES.filter(
    (category) => !enrolledCategories.has(category) && PLANETS[category],
  ).map((category) => ({
    key: `locked:${category}`,
    image: PLANETS[category]!,
    label: t(`common:clubCategory.${category}`),
    title: t('homework.locked', { subject: t(`common:clubCategory.${category}`) }),
    locked: true,
  }));

  return <PlanetMap items={[...enrolled, ...locked]} grow bleed aria-label={t('homework.map')} />;
}
