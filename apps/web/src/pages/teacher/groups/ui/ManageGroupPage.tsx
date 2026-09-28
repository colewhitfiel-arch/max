import { GROUP_TITLE_MAX_LENGTH, type StudentBrief } from '@edu/contracts';
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  PlusIcon,
  Screen,
  SearchIcon,
  Stack,
  Text,
  TrashIcon,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  useAddGroupStudent,
  useGroupCandidates,
  useRemoveGroupStudent,
  useTeacherGroup,
  useUpdateGroup,
} from '@/entities/group';
import { StudentRow } from '@/entities/student';
import { describeApiError, isApiClientError } from '@/shared/api/errors';
import { fullName } from '@/shared/lib/format';
import { isFromApp } from '@/shared/lib/navigation';
import { teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';
import { useDebouncedValue } from '../model';

/**
 * `/teacher/groups/:groupId/edit` — название и состав группы: ученики группы (`GET
 * /teacher/groups/:id`) с кнопкой «убрать», поиск и добавление учеников школы и других групп
 * преподавателя (`GET /teacher/groups/:id/candidates`). Всё сохраняется сразу, без общей кнопки.
 * Открыт из приложения — «назад» по истории, по прямой ссылке — на карточку группы.
 */
export function ManageGroupPage() {
  const { groupId = '' } = useParams();
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const location = useLocation();
  const group = useTeacherGroup(groupId);
  // Чужая (или несуществующая) группа — 403, как на карточке группы.
  const notFound = isApiClientError(group.error) && group.error.code === 'FORBIDDEN';

  return (
    <>
      <ScreenHeader
        title={t('groups.editTitle')}
        subtitle={group.data?.title}
        back={isFromApp(location.state) ? true : teacherGroupPaths.group(groupId)}
      />
      <Screen gap={5}>
        {notFound ? (
          <EmptyState
            title={t('groups.notFoundTitle')}
            description={t('groups.notFoundText')}
            action={
              <Button onClick={() => navigate(teacherGroupPaths.list, { replace: true })}>
                {t('groups.toGroups')}
              </Button>
            }
          />
        ) : (
          <AsyncState query={group}>
            {(detail) => (
              <>
                {/* key: после сохранения поле берёт новое название с сервера. */}
                <GroupTitleForm key={detail.title} groupId={groupId} title={detail.title} />
                <GroupMembers
                  groupId={groupId}
                  students={detail.students.map((row) => row.student)}
                />
                <GroupCandidates groupId={groupId} />
              </>
            )}
          </AsyncState>
        )}
      </Screen>
    </>
  );
}

function GroupTitleForm({ groupId, title }: { groupId: string; title: string }) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const update = useUpdateGroup(groupId);
  const [value, setValue] = useState(title);
  const trimmed = value.trim();
  // Сохранённое название, пока перезапрос не принёс его в `title`, снова сохранять незачем.
  const justSaved = update.isSuccess && update.variables?.title === trimmed;
  const canSave = trimmed.length > 0 && trimmed !== title && !justSaved;

  const onSave = () => {
    if (!canSave || update.isPending) return;
    update.mutate(
      { title: trimmed },
      {
        onSuccess: () => toast.show({ tone: 'success', title: t('groups.saved') }),
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <Stack
      as="form"
      gap={2}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Field label={t('groups.name')} required>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={GROUP_TITLE_MAX_LENGTH}
          autoComplete="off"
        />
      </Field>
      {canSave && (
        <Button type="submit" variant="secondary" loading={update.isPending}>
          {t('groups.save')}
        </Button>
      )}
    </Stack>
  );
}

function GroupMembers({ groupId, students }: { groupId: string; students: StudentBrief[] }) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const remove = useRemoveGroupStudent(groupId);

  const onRemove = (student: StudentBrief) => {
    if (remove.isPending) return;
    const name = fullName(student.user);
    remove.mutate(student.id, {
      onSuccess: () => toast.show({ tone: 'success', title: t('groups.removed', { name }) }),
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });
  };

  return (
    <Stack gap={2}>
      <SectionTitle>{t('groups.membersTitle', { count: students.length })}</SectionTitle>
      {students.length === 0 ? (
        <EmptyState title={t('groups.noStudents')} description={t('groups.noStudentsHint')} />
      ) : (
        <Card padding="none">
          {students.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              right={
                <IconButton
                  aria-label={t('groups.remove', { name: fullName(student.user) })}
                  loading={remove.isPending && remove.variables === student.id}
                  disabled={remove.isPending && remove.variables !== student.id}
                  onClick={() => onRemove(student)}
                >
                  <TrashIcon />
                </IconButton>
              }
            />
          ))}
        </Card>
      )}
    </Stack>
  );
}

function GroupCandidates({ groupId }: { groupId: string }) {
  const { t } = useTranslation('teacher');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const candidates = useGroupCandidates(groupId, q);
  const add = useAddGroupStudent(groupId);

  const onAdd = (student: StudentBrief) => {
    if (add.isPending) return;
    const name = fullName(student.user);
    add.mutate(student.id, {
      onSuccess: () => toast.show({ tone: 'success', title: t('groups.added', { name }) }),
      onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
    });
  };

  return (
    <Stack gap={2}>
      <SectionTitle>{t('groups.addTitle')}</SectionTitle>
      <Text variant="caption" tone="muted">
        {t('groups.addHint')}
      </Text>
      <Field label={t('groups.search')}>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('groups.searchPlaceholder')}
          autoComplete="off"
        />
      </Field>
      <AsyncState
        query={candidates}
        isEmpty={(list) => list.items.length === 0}
        empty={
          <EmptyState
            icon={q.trim() ? <SearchIcon /> : undefined}
            title={q.trim() ? t('groups.nothingFound') : t('groups.noCandidates')}
          />
        }
      >
        {(list) => (
          <Card padding="none">
            {list.items.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                right={
                  <IconButton
                    variant="secondary"
                    aria-label={t('groups.add', { name: fullName(student.user) })}
                    loading={add.isPending && add.variables === student.id}
                    disabled={add.isPending && add.variables !== student.id}
                    onClick={() => onAdd(student)}
                  >
                    <PlusIcon />
                  </IconButton>
                }
              />
            ))}
          </Card>
        )}
      </AsyncState>
    </Stack>
  );
}
