import type { TeacherGroupPerformance } from '@edu/contracts';
import { BarChart, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { groupLabel } from '@/entities/group';
import { barLabel, courseTones } from './model';

export interface TeacherPerformanceAttendanceProps {
  /** Группы преподавателя со счётчиками посещений за выбранный период. */
  groups: TeacherGroupPerformance[];
}

/**
 * Карточка «Посещения» общей успеваемости по макету: слева легенда по курсам («посетили» —
 * цвет курса, «пропустили» — темнее), справа по столбцу на группу (подпись — номер группы,
 * без номера — название без курса; над столбцом — всего отметок). Значения для скринридера —
 * в названии диаграммы.
 */
export function TeacherPerformanceAttendance({ groups }: TeacherPerformanceAttendanceProps) {
  const { t } = useTranslation('teacher-performance');
  const courses = courseTones(groups);
  const toneOf = (clubId: string) =>
    courses.find((course) => course.club.id === clubId)?.tone ?? 'primary';

  const description = groups
    .map(({ group, attended, missed }) => {
      const params = { group: groupLabel(group), club: group.club.title };
      return attended + missed === 0
        ? t('attendance.barEmpty', params)
        : t('attendance.bar', { ...params, attended, missed });
    })
    .join('; ');

  return (
    <BarChart
      title={
        <Text as="h2" variant="small" weight="bold" align="center">
          {t('attendance.title')}
        </Text>
      }
      aria-label={t('attendance.chartLabel', { groups: description })}
      legend={courses.map(({ club, tone }) => ({
        key: club.id,
        title: club.title,
        tone,
        items: [{ label: t('attendance.attended') }, { label: t('attendance.missed'), dim: true }],
      }))}
      bars={groups.map(({ group, attended, missed }) => ({
        key: group.id,
        label: barLabel(group),
        tone: toneOf(group.club.id),
        segments: [
          { key: 'attended', value: attended },
          { key: 'missed', value: missed, dim: true },
        ],
      }))}
    />
  );
}
