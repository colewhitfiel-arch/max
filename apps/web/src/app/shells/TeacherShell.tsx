import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { RoleShell } from './RoleShell';

/** `/teacher/*`: только авторизованный преподаватель. */
export function TeacherShell() {
  return (
    <RequireAuth>
      <RequireRole role="TEACHER">
        <RoleShell role="TEACHER" />
      </RequireRole>
    </RequireAuth>
  );
}
