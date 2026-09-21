import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JOB_QUEUE, type JobQueue } from '../../common/queue/job-queue';
import { TRAJECTORY_JOB, TrajectoryService } from './trajectory.service';

/** Очередь `ai`: построение траектории. */
@Injectable()
export class AiJobs implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly trajectory: TrajectoryService,
  ) {}

  onModuleInit(): void {
    this.queue.process<{ studentId: string }>('ai', TRAJECTORY_JOB, (payload) =>
      this.trajectory.build(payload.studentId),
    );
  }
}
