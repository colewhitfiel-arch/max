import { Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { CreateGroupForm } from '@/features/create-group';
import { useMe } from '@/shared/auth/hooks';
import { isFromApp } from '@/shared/lib/navigation';
import { teacherGroupPaths } from '@/shared/lib/teacher-paths';
import { ScreenHeader } from '@/shared/ui';
import { OPEN_INVITE_STATE } from '../model';

/**
 * `/teacher/groups/new` — своя группа по любому из кружков (свои — первыми). После создания —
 * экран группы с открытой ссылкой-приглашением (docs/07 F19).
 */
export function CreateGroupPage() {
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();

  return (
    <>
      <ScreenHeader
        title={t('newGroup.title')}
        back={isFromApp(location.state) ? true : teacherGroupPaths.list}
      />
      <Screen>
        <CreateGroupForm
          subjects={me?.teacher?.subjects ?? []}
          onCreated={({ group }) =>
            navigate(teacherGroupPaths.group(group.id), { replace: true, state: OPEN_INVITE_STATE })
          }
        />
      </Screen>
    </>
  );
}
