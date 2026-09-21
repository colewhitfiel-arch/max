import { Injectable } from '@nestjs/common';
import type { DomainEventPayload } from '@edu/contracts';
import { OnDomainEvent } from '../../common/events/domain-events';
import { StudentContextBuilder } from './context-builder';

/** Реакции модуля ai на события: устаревание кэша контекста ученика. */
@Injectable()
export class AiEvents {
  constructor(private readonly contexts: StudentContextBuilder) {}

  @OnDomainEvent('attendance.marked')
  async onAttendance(payload: DomainEventPayload<'attendance.marked'>): Promise<void> {
    await Promise.all(payload.rows.map((row) => this.contexts.invalidate(row.studentId)));
  }

  @OnDomainEvent('submission.submitted')
  async onSubmitted(payload: DomainEventPayload<'submission.submitted'>): Promise<void> {
    await this.contexts.invalidate(payload.studentId);
  }

  @OnDomainEvent('submission.graded')
  async onGraded(payload: DomainEventPayload<'submission.graded'>): Promise<void> {
    await this.contexts.invalidate(payload.studentId);
  }

  @OnDomainEvent('block.completed')
  async onBlockCompleted(payload: DomainEventPayload<'block.completed'>): Promise<void> {
    await this.contexts.invalidate(payload.studentId);
  }

  @OnDomainEvent('enrollment.created')
  async onEnrollment(payload: DomainEventPayload<'enrollment.created'>): Promise<void> {
    await this.contexts.invalidate(payload.studentId);
  }
}
