import {
  Button,
  Card,
  EmptyState,
  GraduationCapIcon,
  IconTile,
  Screen,
  SparkIcon,
  Stack,
  UsersIcon,
  VisuallyHidden,
} from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTeacherGroups } from '@/entities/group';
import { useMe } from '@/shared/auth/hooks';
import { FROM_APP_STATE } from '@/shared/lib/navigation';
import {
  TEACHER_SUBJECTS_PATH,
  TEACHER_WALLET_PATH,
  teacherGroupPaths,
} from '@/shared/lib/teacher-paths';
import { TeacherHomeHeader } from '@/widgets/teacher-home-header';
import { TeacherHomeHero } from '@/widgets/teacher-home-hero';
import { TeacherHomeSchedule } from '@/widgets/teacher-home-schedule';

/**
 * `/teacher` — главная репетитора по макету (F16): шапка (аватар, имя, чип кошелька → кошелёк),
 * иллюстрация и расписание дня по всем группам. Загрузка и ошибки — внутри виджетов: кошелёк
 * и расписание грузятся независимо, сбой одного не прячет другое. Пока преподаватель не выбрал
 * свои кружки — над расписанием карточка «Расскажите, что вы ведёте» (F19); пока нет ни одной
 * группы — «Первые шаги»: создать группу и собрать курс из конспекта (новый аккаунт, F21).
 */
export function TeacherHomePage() {
  const { t } = useTranslation('teacher-home');
  const navigate = useNavigate();
  const me = useMe();
  const needsSubjects = me?.teacher?.subjects.length === 0;
  const groups = useTeacherGroups();
  const noGroups = !needsSubjects && groups.data?.items.length === 0;

  return (
    <Screen gap={4} fill>
      <VisuallyHidden as="h1">{t('title')}</VisuallyHidden>
      <TeacherHomeHeader
        onOpenWallet={() => navigate(TEACHER_WALLET_PATH, { state: FROM_APP_STATE })}
      />
      <TeacherHomeHero />
      {needsSubjects && (
        <Card>
          <EmptyState
            icon={
              <IconTile tone="warning" size="xl">
                <GraduationCapIcon />
              </IconTile>
            }
            title={t('setup.title')}
            description={t('setup.text')}
            action={
              <Button onClick={() => navigate(TEACHER_SUBJECTS_PATH, { state: FROM_APP_STATE })}>
                {t('setup.action')}
              </Button>
            }
          />
        </Card>
      )}
      {noGroups && (
        <Card>
          <EmptyState
            icon={
              <IconTile tone="info" size="xl">
                <UsersIcon />
              </IconTile>
            }
            title={t('start.title')}
            description={t('start.text')}
            action={
              <Stack gap={2}>
                <Button onClick={() => navigate(teacherGroupPaths.create)}>
                  {t('start.group')}
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<SparkIcon />}
                  onClick={() => navigate('/teacher/course-builder')}
                >
                  {t('start.course')}
                </Button>
              </Stack>
            }
          />
        </Card>
      )}
      <TeacherHomeSchedule />
    </Screen>
  );
}
