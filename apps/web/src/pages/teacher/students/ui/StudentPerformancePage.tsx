import type { HomeworkCounts, TeacherStudentCard } from '@edu/contracts';
import { Button, CloseIcon, EmptyState, Screen, Skeleton, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTeacherStudent } from '@/entities/student';
import { FROM_ANALYTICS_STATE, isFromApp } from '@/shared/lib/navigation';
import { teacherPerformancePaths, teacherStudentPaths } from '@/shared/lib/teacher-paths';
import { AsyncState } from '@/shared/ui';
import { ClubHomeworkBand, HomeworkPieCard } from '@/widgets/homework-performance';
import { AttendanceWeekCard } from '@/widgets/student-home-attendance';
import { TeacherStudentHeader } from '@/widgets/teacher-student-header';
import { isStudentUnavailable, StudentUnavailable } from './StudentUnavailable';

/** Параметр URL с раскрытым курсом: при возврате с заданий сетка остаётся открытой. */
const EXPANDED_PARAM = 'club';

const NO_HOMEWORK: HomeworkCounts = { correct: 0, wrong: 0, upcoming: 0 };

function StudentPerformanceSkeleton() {
  return (
    <Stack gap={6} aria-busy="true">
      <Skeleton height={159} />
      <Stack gap={2}>
        <Skeleton height={18} width="40%" />
        <Skeleton height={150} />
      </Stack>
      <Skeleton height={102} />
    </Stack>
  );
}

interface StudentPerformanceContentProps {
  card: TeacherStudentCard;
  expandedGroupId: string | null;
  onToggle: (groupId: string) => void;
  onSelectTask: (groupId: string, assignmentId: string) => void;
}

function StudentPerformanceContent({
  card,
  expandedGroupId,
  onToggle,
  onSelectTask,
}: StudentPerformanceContentProps) {
  const { t } = useTranslation('teacher-performance');
  const clubs = card.clubHomework ?? [];
  return (
    <>
      {card.week && card.week.length > 0 && <AttendanceWeekCard week={card.week} />}
      <HomeworkPieCard counts={card.homework ?? NO_HOMEWORK} />
      {clubs.length === 0 ? (
        <EmptyState
          title={t('student.clubsEmptyTitle')}
          description={t('student.clubsEmptyText')}
        />
      ) : (
        <Stack gap={4} role="group" aria-label={t('student.clubsLabel')}>
          {clubs.map((item) => (
            <ClubHomeworkBand
              key={item.group.id}
              item={item}
              expanded={expandedGroupId === item.group.id}
              onToggle={() => onToggle(item.group.id)}
              onSelectTask={(assignmentId) => onSelectTask(item.group.id, assignmentId)}
            />
          ))}
        </Stack>
      )}
    </>
  );
}

/**
 * `/teacher/students/:studentId` — успеваемость ученика по макету (как у родителя): дуга
 * посещений недели, круговая «Домашние задачи» и полосы курсов с раскрываемой сеткой заданий
 * (одна раскрыта за раз, запоминается в `?club=`); клетка → задания ученика в группе.
 * «Успеваемость ✕»: открыт из приложения — шаг назад, по прямой ссылке — к общей успеваемости.
 * Данные — `GET /teacher/students/:studentId` (`week`, `homework`, `clubHomework` по группам
 * преподавателя); ученик не из его групп — «Ученик не в ваших группах».
 */
export function StudentPerformancePage() {
  const { t } = useTranslation('teacher-performance');
  const navigate = useNavigate();
  const location = useLocation();
  const { studentId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const expandedGroupId = searchParams.get(EXPANDED_PARAM);
  const query = useTeacherStudent(studentId);
  const unavailable = isStudentUnavailable(query.error);

  // Состояние навигации (`fromApp`) сохраняем, чтобы «✕» после раскрытия курса вёл назад.
  const toggle = (groupId: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get(EXPANDED_PARAM) === groupId) next.delete(EXPANDED_PARAM);
        else next.set(EXPANDED_PARAM, groupId);
        return next;
      },
      { replace: true, state: location.state },
    );

  const openTask = (groupId: string, assignmentId: string) =>
    navigate(teacherStudentPaths.tasks(studentId, groupId, assignmentId), {
      state: FROM_ANALYTICS_STATE,
    });

  const close = () => {
    if (isFromApp(location.state)) navigate(-1);
    else navigate(teacherPerformancePaths.overview, { replace: true });
  };

  return (
    <>
      <TeacherStudentHeader
        screenLabel={t('student.title')}
        student={query.data?.student}
        fallback={query.isPending ? undefined : t('student.title')}
        action={
          <Button
            variant="link"
            aria-label={t('student.closeLabel')}
            rightIcon={<CloseIcon size={23} />}
            onClick={close}
          >
            {t('student.close')}
          </Button>
        }
      />
      <Screen gap={6}>
        {unavailable ? (
          <StudentUnavailable />
        ) : (
          <AsyncState query={query} skeleton={<StudentPerformanceSkeleton />}>
            {(card) => (
              <StudentPerformanceContent
                card={card}
                expandedGroupId={expandedGroupId}
                onToggle={toggle}
                onSelectTask={openTask}
              />
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}
