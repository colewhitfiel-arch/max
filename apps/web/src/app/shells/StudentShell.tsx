import { Navigate } from 'react-router';
import { RequireAuth, RequireRole } from '@/shared/auth/guards';
import { ONBOARDING_PATH, needsStudentOnboarding } from '@/shared/auth/role-routes';
import { useAuthStore } from '@/shared/auth/store';
import { RoleShell } from './RoleShell';

/** `/student/*`: только авторизованный ученик, прошедший онбординг (docs/07). */
export function StudentShell() {
  return (
    <RequireAuth>
      <RequireRole role="STUDENT">
        <StudentOnboardingGate />
      </RequireRole>
    </RequireAuth>
  );
}

/** Прямой заход / deep-link на экраны ученика без онбординга → `/onboarding`. */
function StudentOnboardingGate() {
  const me = useAuthStore((s) => s.me);
  if (needsStudentOnboarding(me)) return <Navigate to={ONBOARDING_PATH} replace />;
  return <RoleShell role="STUDENT" />;
}
