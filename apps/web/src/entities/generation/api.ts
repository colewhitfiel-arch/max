import type { CourseDraft, CreateGenerationJobBody, GenerationStage } from '@edu/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { generationKeys } from './keys';

const RUNNING: readonly GenerationStage[] = [
  'QUEUED',
  'EXTRACTING',
  'OUTLINING',
  'GENERATING',
  'ASSEMBLING',
];

export const isGenerationRunning = (stage: GenerationStage) => RUNNING.includes(stage);

/** `GET /teacher/course-builder/jobs`. */
export function useGenerationJobs() {
  return useQuery({
    queryKey: generationKeys.list(),
    queryFn: () => call(api.courseBuilder.listGenerationJobs({ query: {} })),
  });
}

/** `GET /teacher/course-builder/jobs/:id` с опросом раз в 3 с, пока идёт генерация (F8). */
export function useGenerationJob(jobId: string) {
  return useQuery({
    queryKey: generationKeys.detail(jobId),
    queryFn: () => call(api.courseBuilder.getGenerationJob({ params: { jobId } })),
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      return stage && isGenerationRunning(stage) ? 3000 : false;
    },
  });
}

/** `POST /teacher/course-builder/jobs`. */
export function useCreateGenerationJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGenerationJobBody) =>
      call(api.courseBuilder.createGenerationJob({ body })),
    onSuccess: (job) => {
      queryClient.setQueryData(generationKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: generationKeys.list() });
    },
  });
}

/** `PUT /teacher/course-builder/jobs/:id/draft`. */
export function useUpdateGenerationDraft(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: CourseDraft) =>
      call(api.courseBuilder.updateGenerationDraft({ params: { jobId }, body: { draft } })),
    onSuccess: (job) => queryClient.setQueryData(generationKeys.detail(jobId), job),
  });
}

/** `POST /teacher/course-builder/jobs/:id/accept` → courseId. */
export function useAcceptGenerationJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.courseBuilder.acceptGenerationJob({ params: { jobId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.teacher }),
  });
}

/** `POST /teacher/course-builder/jobs/:id/cancel`. */
export function useCancelGenerationJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.courseBuilder.cancelGenerationJob({ params: { jobId } })),
    onSuccess: (job) => {
      queryClient.setQueryData(generationKeys.detail(jobId), job);
      void queryClient.invalidateQueries({ queryKey: generationKeys.list() });
    },
  });
}
