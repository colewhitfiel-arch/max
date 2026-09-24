import type { ClubBrief } from '@edu/contracts';
import { IllustrationRow } from '@edu/ui';
import art from './assets/subject-art.png';
import chess from './assets/subject-chess.png';
import chinese from './assets/subject-chinese.png';
import english from './assets/subject-english.png';
import programming from './assets/subject-programming.png';
import projectAlt from './assets/subject-project-alt.png';
import project from './assets/subject-project.png';
import robotics from './assets/subject-robotics.png';
import speaking from './assets/subject-speaking.png';

type Subject = Pick<ClubBrief, 'id' | 'title' | 'category'>;

/**
 * Иконка предмета из набора макета. Категории мало для языков и «прочего», поэтому сперва
 * смотрим на название кружка (китайский, ораторское искусство, проектная деятельность),
 * затем на категорию; предметы без своей иконки получают общую «учёбу».
 */
export function subjectIcon({ title, category }: Pick<ClubBrief, 'title' | 'category'>): string {
  const name = title.toLowerCase();
  if (name.includes('китай')) return chinese;
  if (name.includes('оратор') || name.includes('публичн')) return speaking;
  if (name.includes('проект')) return project;
  switch (category) {
    case 'ROBOTICS':
      return robotics;
    case 'CHESS':
      return chess;
    case 'PROGRAMMING':
      return programming;
    case 'LANGUAGES':
      return english;
    case 'ART':
      return art;
    case 'SCIENCE':
      return project;
    default:
      return projectAlt;
  }
}

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
      ? shown.map((subject) => ({ key: subject.id, src: subjectIcon(subject) }))
      : [{ key: 'placeholder', src: projectAlt }];
  return <IllustrationRow items={items} muted={muted} aria-hidden="true" />;
}
