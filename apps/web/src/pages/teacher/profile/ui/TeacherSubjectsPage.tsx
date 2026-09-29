import { CLUB_CATEGORIES, type ClubCategory } from '@edu/contracts';
import { Button, Field, Input, Screen, Stack, Text, useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { ClubPickList } from '@/entities/club';
import { useUpdateTeacherProfile } from '@/entities/session';
import { describeApiError } from '@/shared/api/errors';
import { useMe } from '@/shared/auth/hooks';
import { isFromApp } from '@/shared/lib/navigation';
import { isTeacherSetup, TEACHER_HOME_PATH } from '@/shared/lib/teacher-paths';
import { ScreenHeader, SectionTitle } from '@/shared/ui';

/**
 * `/teacher/profile/subjects` — «Что вы ведёте?»: преподаватель сам отмечает любые из 8 кружков
 * (с иконками) и пишет пару слов о себе → `PATCH /me/teacher`. Открывается сразу после выбора роли
 * преподавателя, с главной (пока кружки не выбраны) и из профиля.
 */
export function TeacherSubjectsPage() {
  const { t } = useTranslation('teacher-profile');
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const me = useMe();
  const update = useUpdateTeacherProfile();
  const [selected, setSelected] = useState<ClubCategory[]>(me?.teacher?.subjects ?? []);
  const [qualification, setQualification] = useState(me?.teacher?.qualification ?? '');
  const [error, setError] = useState<string | null>(null);
  const setup = isTeacherSetup(location.state);

  const toggle = (category: ClubCategory) => {
    setError(null);
    setSelected((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );
  };

  const leave = () => {
    if (setup) navigate(TEACHER_HOME_PATH, { replace: true });
    else if (isFromApp(location.state)) navigate(-1);
    else navigate('/teacher/profile', { replace: true });
  };

  const onSave = async () => {
    if (selected.length === 0) {
      setError(t('subjectsPage.pickOne'));
      return;
    }
    try {
      await update.mutateAsync({ subjects: selected, qualification: qualification.trim() || null });
      toast.show({ tone: 'success', title: t('subjectsPage.saved') });
      leave();
    } catch (cause) {
      toast.show({
        tone: 'danger',
        title: t('subjectsPage.saveError'),
        description: describeApiError(cause),
      });
    }
  };

  return (
    <>
      <ScreenHeader
        title={t('subjectsPage.title')}
        subtitle={t('subjectsPage.subtitle')}
        back={setup ? undefined : isFromApp(location.state) ? true : '/teacher/profile'}
      />
      <Screen gap={5}>
        <Stack gap={2}>
          <SectionTitle>{t('subjectsPage.list')}</SectionTitle>
          <ClubPickList
            categories={CLUB_CATEGORIES}
            selected={selected}
            onToggle={toggle}
            aria-label={t('subjectsPage.list')}
          />
          <Text
            variant="caption"
            tone={error ? 'danger' : 'muted'}
            role={error ? 'alert' : undefined}
          >
            {error ?? t('subjectsPage.selected', { count: selected.length })}
          </Text>
        </Stack>

        <Field label={t('subjectsPage.qualification')} hint={t('subjectsPage.qualificationHint')}>
          <Input
            value={qualification}
            maxLength={200}
            onChange={(event) => setQualification(event.target.value)}
          />
        </Field>

        <Button fullWidth loading={update.isPending} onClick={() => void onSave()}>
          {t('subjectsPage.save')}
        </Button>
      </Screen>
    </>
  );
}
