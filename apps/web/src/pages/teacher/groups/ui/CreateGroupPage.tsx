import { GROUP_TITLE_MAX_LENGTH } from '@edu/contracts';
import { Button, Field, Input, Screen, Select, Stack, useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useCatalogClubs } from '@/entities/club';
import { useCreateGroup } from '@/entities/group';
import { describeApiError } from '@/shared/api/errors';
import { FROM_APP_STATE, isFromApp } from '@/shared/lib/navigation';
import { teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { ScreenHeader } from '@/shared/ui';

/**
 * `/teacher/groups/new` — новая группа: название и кружок школы (`GET /catalog/clubs` — кружки
 * школы преподавателя) → `POST /teacher/groups` → сразу к составу, добавлять учеников.
 * Экран по высоте области, кнопка прижата к низу. Открыт из приложения (список групп, «Задать
 * ДЗ») — «назад» по истории, иначе — к списку групп.
 */
export function CreateGroupPage() {
  const { t } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const clubs = useCatalogClubs({ limit: 100 });
  const create = useCreateGroup();
  const [title, setTitle] = useState('');
  const [clubId, setClubId] = useState('');

  const options = (clubs.data?.items ?? []).map((club) => ({ value: club.id, label: club.title }));
  // Пока кружок не выбран явно — первый кружок школы.
  const selectedClub = clubId || options[0]?.value || '';
  const noClubs = clubs.isSuccess && options.length === 0;
  const canSubmit = title.trim().length > 0 && !!selectedClub;

  const onSubmit = () => {
    if (!canSubmit || create.isPending) return;
    create.mutate(
      { title: title.trim(), clubId: selectedClub },
      {
        onSuccess: (group) => {
          toast.show({ tone: 'success', title: t('groups.created') });
          // Экран создания заменяется составом: «назад» оттуда ведёт туда, откуда создавали.
          navigate(teacherGroupPaths.edit(group.id), {
            replace: true,
            state: isFromApp(location.state) ? FROM_APP_STATE : undefined,
          });
        },
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <>
      <ScreenHeader
        title={t('groups.createTitle')}
        back={isFromApp(location.state) ? true : teacherGroupPaths.list}
      />
      <Screen fixed>
        <Stack
          as="form"
          id="create-group"
          gap={4}
          scroll
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Field label={t('groups.name')} required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={GROUP_TITLE_MAX_LENGTH}
              placeholder={t('groups.namePlaceholder')}
              autoComplete="off"
            />
          </Field>

          <Stack gap={1}>
            <Field
              label={t('groups.club')}
              required
              disabled={clubs.isPending || clubs.isError || noClubs}
              hint={
                clubs.isPending
                  ? tc('states.loading')
                  : noClubs
                    ? t('groups.noClubs')
                    : t('groups.clubHint')
              }
              error={clubs.isError ? describeApiError(clubs.error) : undefined}
            >
              <Select
                value={selectedClub}
                onChange={(event) => setClubId(event.target.value)}
                placeholder={t('groups.clubPlaceholder')}
                options={options}
              />
            </Field>
            {clubs.isError && (
              <Button variant="ghost" size="sm" onClick={() => void clubs.refetch()}>
                {tc('actions.retry')}
              </Button>
            )}
          </Stack>
        </Stack>

        <Button
          type="submit"
          form="create-group"
          fullWidth
          size="lg"
          loading={create.isPending}
          disabled={!canSubmit}
        >
          {t('groups.create')}
        </Button>
      </Screen>
    </>
  );
}
