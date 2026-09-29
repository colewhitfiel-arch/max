import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { RoleShell } from './RoleShell';

/**
 * `/teacher/*`: только авторизованный преподаватель. Экраны — ровно по высоте области между
 * шапкой и меню (`fitContent`): без лишней прокрутки на высоту шапки экрана.
 */
export function TeacherShell() {
  return (
    <RequireAuth>
      <RequireRole role="TEACHER">
        <RoleShell role="TEACHER" fitContent />
      </RequireRole>
    </RequireAuth>
  );
}
