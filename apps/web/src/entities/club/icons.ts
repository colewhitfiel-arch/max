import type { ClubCategory } from '@edu/contracts';
import parentArt from './assets/parent/art.png';
import parentChess from './assets/parent/chess.png';
import parentChinese from './assets/parent/chinese.png';
import parentEnglish from './assets/parent/english.png';
import parentEntrepreneurship from './assets/parent/entrepreneurship.png';
import parentProgramming from './assets/parent/programming.png';
import parentRobotics from './assets/parent/robotics.png';
import parentSpeaking from './assets/parent/speaking.png';
import planetArt from './assets/planet/art.png';
import planetChess from './assets/planet/chess.png';
import planetChinese from './assets/planet/chinese.png';
import planetEnglish from './assets/planet/english.png';
import planetEntrepreneurship from './assets/planet/entrepreneurship.png';
import planetProgramming from './assets/planet/programming.png';
import planetRobotics from './assets/planet/robotics.png';
import planetSpeaking from './assets/planet/speaking.png';
import studentArt from './assets/student/art.png';
import studentChess from './assets/student/chess.png';
import studentChinese from './assets/student/chinese.png';
import studentEnglish from './assets/student/english.png';
import studentEntrepreneurship from './assets/student/entrepreneurship.png';
import studentProgramming from './assets/student/programming.png';
import studentRobotics from './assets/student/robotics.png';
import studentSpeaking from './assets/student/speaking.png';

/**
 * Наборы иконок кружков из макета:
 * - `student` — синий набор (главная ученика); им же пользуется режим преподавателя;
 * - `parent` — зелёный набор (главная и витрина родителя);
 * - `planet` — планеты карты заданий ученика («Предпринимательство» — ракета из синего набора).
 */
export type ClubIconSet = 'student' | 'parent' | 'planet';

/** У каждого кружка — своя иконка в каждом наборе: `Record` не даст забыть новый кружок. */
const CLUB_ICONS: Record<ClubIconSet, Record<ClubCategory, string>> = {
  student: {
    ROBOTICS: studentRobotics,
    CHINESE: studentChinese,
    ENGLISH: studentEnglish,
    PROGRAMMING: studentProgramming,
    ENTREPRENEURSHIP: studentEntrepreneurship,
    ART: studentArt,
    PUBLIC_SPEAKING: studentSpeaking,
    CHESS: studentChess,
  },
  parent: {
    ROBOTICS: parentRobotics,
    CHINESE: parentChinese,
    ENGLISH: parentEnglish,
    PROGRAMMING: parentProgramming,
    ENTREPRENEURSHIP: parentEntrepreneurship,
    ART: parentArt,
    PUBLIC_SPEAKING: parentSpeaking,
    CHESS: parentChess,
  },
  planet: {
    ROBOTICS: planetRobotics,
    CHINESE: planetChinese,
    ENGLISH: planetEnglish,
    PROGRAMMING: planetProgramming,
    ENTREPRENEURSHIP: planetEntrepreneurship,
    ART: planetArt,
    PUBLIC_SPEAKING: planetSpeaking,
    CHESS: planetChess,
  },
};

/** Иконка кружка по его направлению (`Club.category`) в наборе нужного режима. */
export function clubIcon(category: ClubCategory, set: ClubIconSet = 'student'): string {
  return CLUB_ICONS[set][category];
}
