import { Navigate } from 'react-router';
import { useAuthStore } from '@/shared/auth/store';
import {
  AUTH_PATH,
  ONBOARDING_PATH,
  ROLE_SETUP_PATH,
  roleHomePath,
} from '@/shared/auth/role-routes';
import { Splash } from './splash';

/** Куда ведёт `/`: по статусу сессии, активной роли и онбордингу ученика. */
export function rootPath(state: Pick<ReturnType<typeof useAuthStore.getState>, 'status' | 'me'>) {
  if (state.status === 'anonymous') return AUTH_PATH;
  const me = state.me;
  if (!me) return AUTH_PATH;
  if (me.needsRoleSetup || !me.activeRole) return ROLE_SETUP_PATH;
  if (me.activeRole === 'STUDENT' && me.student && !me.student.onboardingCompleted) {
    return ONBOARDING_PATH;
  }
  return roleHomePath(me.activeRole);
}

export function RootRedirect() {
  const status = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.me);
  if (status === 'idle' || status === 'loading') return <Splash />;
  return <Navigate to={rootPath({ status, me })} replace />;
}
