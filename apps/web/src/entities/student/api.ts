import type { HomeworkProgressDays, LinkChildResult } from '@edu/contracts';
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/auth/store';
import { studentKeys } from './keys';

export interface UseChildrenOptions {
  /**
   * Перечитывать список с этим интервалом, мс (пока ждём, что ребёнок примет приглашение).
   * По умолчанию не перечитывается сам — только по фокусу окна и инвалидации.
   */
  refetchInterval?: number | false;
}

/** `GET /parent/children`. */
export function useChildren(enabled = true, { refetchInterval = false }: UseChildrenOptions = {}) {
  return useQuery({
    queryKey: studentKeys.children(),
    queryFn: () => call(api.family.listChildren()),
    enabled,
    refetchInterval,
  });
}

/** `POST /parent/children/link` — привязка по коду; обновляет список детей и me.parent.childrenCount. */
export function useLinkChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: studentKeys.linkChild(),
    mutationFn: (code: string) => call(api.family.linkChild({ body: { code } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studentKeys.children() });
      const { me, updateMe } = useAuthStore.getState();
      if (me?.parent) {
        updateMe({ ...me, parent: { ...me.parent, childrenCount: me.parent.childrenCount + 1 } });
      }
    },
  });
}

/** Успешная привязка по коду: кого привязали и когда отправили запрос (мс). */
export interface CodeLink {
  studentId: string | undefined;
  submittedAt: number;
}

/**
 * Привязки по коду (`useLinkChild`) из кэша мутаций: идёт ли сейчас такая привязка и кого уже
 * привязали. По ним экран ссылки-приглашения не принимает ребёнка, привязанного по коду, за
 * того, кто принял приглашение.
 */
export function useCodeLinkedChildren(): { pending: boolean; links: CodeLink[] } {
  const pending = useIsMutating({ mutationKey: studentKeys.linkChild() }) > 0;
  const links = useMutationState({
    filters: { mutationKey: studentKeys.linkChild(), status: 'success' },
    select: (mutation): CodeLink => ({
      studentId: (mutation.state.data as LinkChildResult | undefined)?.student.id,
      submittedAt: mutation.state.submittedAt,
    }),
  });
  return { pending, links };
}

/** `DELETE /parent/children/:studentId`. */
export function useUnlinkChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => call(api.family.unlinkChild({ params: { studentId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.parentRoot }),
  });
}

/**
 * `POST /parent/children/invites` — ссылка-приглашение, которую родитель отправляет ребёнку в MAX
 * (действует `CHILD_INVITE_TTL_DAYS`). Ребёнок появится в списке, когда примет приглашение.
 */
export function useCreateChildInvite() {
  return useMutation({
    mutationFn: () => call(api.family.createChildInvite()),
  });
}

/** `GET /student/parent-invites/:token` — ученик открыл ссылку родителя; `null` — не запрашивать. */
export function useParentInvite(token: string | null) {
  return useQuery({
    queryKey: studentKeys.parentInvite(token ?? ''),
    queryFn: () => call(api.family.getParentInvite({ params: { token: token! } })),
    enabled: !!token,
    retry: false,
  });
}

/** `POST /student/parent-invites/:token/accept` — связь с родителем становится ACTIVE. */
export function useAcceptParentInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => call(api.family.acceptParentInvite({ params: { token } })),
    onSuccess: (_result, token) =>
      queryClient.invalidateQueries({ queryKey: studentKeys.parentInvite(token) }),
  });
}

/** `GET /parent/children/:studentId/home`. */
export function useParentHome(studentId: string | null) {
  return useQuery({
    queryKey: studentKeys.parentHome(studentId ?? ''),
    queryFn: () => call(api.dashboards.getParentChildHome({ params: { studentId: studentId! } })),
    enabled: !!studentId,
  });
}

/**
 * `GET /parent/children/:studentId/homework-progress?days=1|7|30` — «Выполненные задания» на
 * главной родителя: по кружку сдано (`done`) и рекомендовано (`recommended`) за окно.
 */
export function useChildHomeworkProgress(studentId: string | null, days: HomeworkProgressDays) {
  return useQuery({
    queryKey: studentKeys.homeworkProgress(studentId ?? '', days),
    queryFn: () =>
      call(
        api.dashboards.getParentChildHomeworkProgress({
          params: { studentId: studentId! },
          query: { days },
        }),
      ),
    enabled: !!studentId,
    // Смена окна не мигает скелетом (круги плавно меняют размер); смена ребёнка — мигает.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === studentId ? previous : undefined,
  });
}

/** `GET /teacher/students/:studentId`. */
export function useTeacherStudent(studentId: string) {
  return useQuery({
    queryKey: studentKeys.teacherStudent(studentId),
    queryFn: () => call(api.dashboards.getTeacherStudent({ params: { studentId } })),
  });
}
