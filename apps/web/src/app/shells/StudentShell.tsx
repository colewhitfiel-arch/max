import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { RoleShell } from './RoleShell';

/** `/student/*`: только авторизованный ученик. */
export function StudentShell() {
  return (
    <RequireAuth>
      <RequireRole role="STUDENT">
        <RoleShell role="STUDENT" />
      </RequireRole>
    </RequireAuth>
  );
}
