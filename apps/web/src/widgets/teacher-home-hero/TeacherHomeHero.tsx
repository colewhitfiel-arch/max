import { Illustration } from '@edu/ui';
import tutorDashboard from './assets/tutor-dashboard.webp';

/**
 * Иллюстрация главной репетитора (макет: 342×256 под шапкой). Декоративная — смысл экрана
 * передают шапка и расписание, поэтому скринридер её пропускает.
 */
export function TeacherHomeHero() {
  return <Illustration src={tutorDashboard} />;
}
