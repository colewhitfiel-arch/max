import type { ClubBrief } from '@edu/contracts';
import { IllustrationRow } from '@edu/ui';
import { clubIcon } from '@/entities/club';
import projectAlt from './assets/subject-project-alt.png';

type Subject = Pick<ClubBrief, 'id' | 'title' | 'category'>;

const uniqueById = (subjects: Subject[]) =>
  subjects.filter((subject, i) => subjects.findIndex((s) => s.id === subject.id) === i);

export interface StudentHomeHeroProps {
  /** Кружки занятий выбранного дня в порядке расписания. */
  subjects: Subject[];
  /** Все кружки ученика: в день без занятий они стоят приглушённо. */
  allSubjects: Subject[];
}

/**
 * Иконки предметов выбранного дня: одно занятие — одна иконка, два разных кружка — две рядом
 * и т. д. В свободный день — все кружки ученика серыми («не сегодня»). Декоративно:
 * те же предметы перечислены в расписании ниже.
 */
export function StudentHomeHero({ subjects, allSubjects }: StudentHomeHeroProps) {
  const today = uniqueById(subjects);
  const muted = today.length === 0;
  const shown = muted ? uniqueById(allSubjects) : today;
  const items =
    shown.length > 0
      ? shown.map((subject) => ({ key: subject.id, src: clubIcon(subject.category) }))
      : [{ key: 'placeholder', src: projectAlt }];
  return <IllustrationRow items={items} muted={muted} aria-hidden="true" />;
}
