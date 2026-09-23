import { Button, EmptyState } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { isApiClientError } from '@/shared/api/errors';
import { teacherPerformancePaths } from '@/shared/lib/teacher-paths';

/**
 * Ученик не в группах преподавателя или группа чужая — `FORBIDDEN` (несуществующий id сервер
 * тоже отдаёт как 403, docs/05). `NOT_FOUND` сюда не относится: это «раздел в разработке»
 * (нет ручки на сервере) — его показывает `AsyncState` (AGENT_GUIDE §3).
 */
export function isStudentUnavailable(error: unknown): boolean {
  return isApiClientError(error) && error.code === 'FORBIDDEN';
}

/** Пустое состояние «Ученик не в ваших группах» с возвратом к общей успеваемости. */
export function StudentUnavailable() {
  const { t } = useTranslation('teacher-performance');
  const navigate = useNavigate();
  return (
    <EmptyState
      title={t('student.notFoundTitle')}
      description={t('student.notFoundText')}
      action={
        <Button onClick={() => navigate(teacherPerformancePaths.overview, { replace: true })}>
          {t('toPerformance')}
        </Button>
      }
    />
  );
}
