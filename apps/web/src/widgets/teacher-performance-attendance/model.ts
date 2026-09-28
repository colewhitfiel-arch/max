import type { ClubBrief, GroupBrief, TeacherGroupPerformance } from '@edu/contracts';
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

/**
 * Подпись столбца группы: код («001»), а без кода — название без названия курса в начале
 * («Робототехника, группа А» → «группа А»): курс и так виден по цвету столбца и легенде,
 * а места под столбцом мало. Полное название — в описании диаграммы для скринридера.
 */
export function barLabel(
  group: Pick<GroupBrief, 'code' | 'title'> & { club: Pick<ClubBrief, 'title'> },
): string {
  if (group.code != null) return group.code;
  const title = group.title.trim();
  const club = group.club.title.trim();
  const rest = title.slice(club.length);
  // Только целым словом: курс «Робот» не отрезается от «Робототехники».
  if (!club || !title.toLowerCase().startsWith(club.toLowerCase()) || /^[\p{L}\p{N}]/u.test(rest))
    return title;
  return rest.replace(/^[\s,.:;·—–-]+/, '') || title;
}
