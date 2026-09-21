export {
  useAuthStore,
  bootstrapAuth,
  configureAuthStorage,
  resetAuthStore,
  AUTH_STORAGE_KEYS,
  type AuthState,
  type AuthStatus,
} from './store';
export { useAuth, useMe, useActiveRole, useHasPermission, useCapabilities } from './hooks';
export {
  ROLE_HOME,
  roleHomePath,
  AUTH_PATH,
  ROLE_SETUP_PATH,
  SWITCH_ROLE_PATH,
  ONBOARDING_PATH,
  FORBIDDEN_PATH,
} from './role-routes';
