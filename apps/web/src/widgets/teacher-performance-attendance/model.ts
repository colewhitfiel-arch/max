import type { ClubBrief, TeacherGroupPerformance } from '@edu/contracts';
import type { BarChartTone } from '@edu/ui';

/** Цвета курсов по порядку появления (макет: 1-й — акцент, 2-й — зелёный), далее по кругу. */
const COURSE_TONES: readonly BarChartTone[] = ['primary', 'success', 'info', 'danger'];

export interface CourseTone {
  club: ClubBrief;
  tone: BarChartTone;
}

/**
 * Курсы (кружки) групп в порядке первого появления с цветом: столбцы групп одного курса и
 * строка легенды окрашены одинаково.
 */
export function courseTones(groups: readonly TeacherGroupPerformance[]): CourseTone[] {
  const courses: CourseTone[] = [];
  for (const { group } of groups) {
    if (courses.some((course) => course.club.id === group.club.id)) continue;
    courses.push({
      club: group.club,
      tone: COURSE_TONES[courses.length % COURSE_TONES.length]!,
    });
  }
  return courses;
}
