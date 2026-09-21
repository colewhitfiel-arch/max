import { useQuery } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { dashboardKeys } from './keys';

/** `GET /student/home`. */
export function useStudentHome() {
  return useQuery({
    queryKey: dashboardKeys.studentHome(),
    queryFn: () => call(api.dashboards.getStudentHome()),
  });
}

/** `GET /student/profile`. */
export function useStudentProfile() {
  return useQuery({
    queryKey: dashboardKeys.studentProfile(),
    queryFn: () => call(api.dashboards.getStudentProfile()),
  });
}

/** `GET /teacher/home`. */
export function useTeacherHome() {
  return useQuery({
    queryKey: dashboardKeys.teacherHome(),
    queryFn: () => call(api.dashboards.getTeacherHome()),
  });
}

/** `GET /health` — для dev-диагностики. */
export function useHealth(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: () => call(api.health.getHealth()),
    enabled,
    staleTime: 60_000,
  });
}
