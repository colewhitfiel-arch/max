import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { CourseBuilderService, GENERATE_JOB } from './course-builder.service';

export interface GenerateJobPayload {
  jobId: string;
  userId: string;
}

/** Обработчик очереди `course-builder`: один job = один прогон пайплайна. Идемпотентен по стадии. */
@Injectable()
export class CourseBuilderJobs implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly service: CourseBuilderService,
  ) {}

  onModuleInit(): void {
    this.queue.process<GenerateJobPayload>('course-builder', GENERATE_JOB, (payload) =>
      this.service.runJob(payload.jobId, payload.userId),
    );
  }
}
