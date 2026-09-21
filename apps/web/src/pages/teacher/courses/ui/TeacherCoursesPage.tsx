import { Button, Card, EmptyState, Field, Input, Screen, Select, Stack, useToast } from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { TeacherCourseCardView, useCreateCourse, useTeacherCourses } from '@/entities/course';
import { useTeacherGroups } from '@/entities/group';
import { describeApiError } from '@/shared/api/errors';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/teacher/courses` — `GET /teacher/courses` + создание пустого курса. */
export function TeacherCoursesPage() {
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const toast = useToast();
  const query = useTeacherCourses();
  const groups = useTeacherGroups();
  const create = useCreateCourse();
  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState('');

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !groupId) return;
    create.mutate(
      { groupId, title: title.trim() },
      {
        onSuccess: (course) => {
          toast.show({ tone: 'success', title: t('courses.created') });
          setTitle('');
          navigate(`/teacher/courses/${course.id}`);
        },
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <>
      <ScreenHeader title={t('courses.title')} bell />
      <Screen>
        <AsyncState
          query={query}
          isEmpty={(list) => list.items.length === 0}
          empty={<EmptyState title={t('courses.empty')} description={t('courses.emptyHint')} />}
        >
          {(list) => (
            <Stack gap={3}>
              {list.items.map((course) => (
                <TeacherCourseCardView
                  key={course.id}
                  course={course}
                  onClick={() => navigate(`/teacher/courses/${course.id}`)}
                />
              ))}
            </Stack>
          )}
        </AsyncState>

        <Stack gap={2}>
          <SectionTitle>{t('courses.create')}</SectionTitle>
          <Card>
            <form onSubmit={onCreate}>
              <Stack gap={3}>
                <Field label={t('courses.createTitle')} required>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </Field>
                <Field label={t('courses.group')} required>
                  <Select
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                    placeholder={t('courses.group')}
                    options={(groups.data?.items ?? []).map((group) => ({
                      value: group.id,
                      label: group.title,
                    }))}
                  />
                </Field>
                <Button
                  type="submit"
                  fullWidth
                  loading={create.isPending}
                  disabled={!title.trim() || !groupId}
                >
                  {t('courses.create')}
                </Button>
              </Stack>
            </form>
          </Card>
        </Stack>
      </Screen>
    </>
  );
}
