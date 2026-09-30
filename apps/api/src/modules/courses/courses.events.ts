import { Injectable } from '@nestjs/common';
import type { DomainEventPayload } from '@edu/contracts';
import { OnDomainEvent } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { StudentCoursesService } from './student-courses.service';

/**
 * Реакции модуля courses: сданное задание из блока курса засчитывает блок, а тест
 * проверяется сразу — ученик в плеере курса видит результат, не дожидаясь преподавателя.
 */
@Injectable()
export class CoursesEvents {
  private readonly log;

  constructor(
    private readonly studentCourses: StudentCoursesService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'courses' });
  }

  @OnDomainEvent('submission.submitted')
  async onSubmitted(payload: DomainEventPayload<'submission.submitted'>): Promise<void> {
    // Сдача уже сохранена: сбой здесь не должен превращать её в ошибку для ученика.
    try {
      await this.studentCourses.completeFromSubmission(payload.submissionId);
    } catch (error) {
      this.log.error(
        { submissionId: payload.submissionId, err: error },
        'не удалось засчитать блок по сдаче',
      );
    }
  }
}
