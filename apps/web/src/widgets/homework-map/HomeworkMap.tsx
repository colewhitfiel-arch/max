import type { ClubCategory, HomeworkClub } from '@edu/contracts';
import { PlanetMap, type PlanetMapItem } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { diffCalendarDays, formatDate } from '@/shared/lib/dates';
import planetChess from './assets/planet-chess.png';
import planetEnglish from './assets/planet-english.png';
import planetProgramming from './assets/planet-programming.png';
import planetRobotics from './assets/planet-robotics.png';
import stars from './assets/stars.png';

/** Планеты из макета по категории кружка; остальным категориям — по кругу. */
const PLANETS: Partial<Record<ClubCategory, string>> = {
  CHESS: planetChess,
  LANGUAGES: planetEnglish,
  PROGRAMMING: planetProgramming,
  ROBOTICS: planetRobotics,
};
const FALLBACK_PLANETS = [planetRobotics, planetProgramming, planetEnglish, planetChess];

export interface HomeworkMapProps {
  /** Кружки в порядке ближайшего дедлайна (как отдаёт API). */
  clubs: HomeworkClub[];
  /** Открыть ближайшее задание кружка. */
  onOpenAssignment: (assignmentId: string) => void;
}

/**
 * Карта заданий по кружкам: планета на кружок, баллы крупно, название под линией;
 * над самым срочным кружком — жёлтая пометка со сроком. Тап по планете — ближайшее задание.
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
    return t('homework.due.date', { date: formatDate(dueAt, i18n.language) });
  };

  const items: PlanetMapItem[] = clubs.map((item, index) => {
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
        points: item.points,
        open: item.openCount,
      }),
      onClick: next ? () => onOpenAssignment(next.id) : undefined,
    };
  });

  return <PlanetMap items={items} backdrop={stars} grow bleed aria-label={t('homework.map')} />;
}
