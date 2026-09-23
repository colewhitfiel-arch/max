import { Injectable } from '@nestjs/common';
import { AiRepository } from './ai.repository';

/**
 * Публичный сервис модуля ai для analytics: вклад переписки с тьютором в «активность»
 * (docs/04 §4.6, `2 * tutorMessages`). Ни одна формула здесь не считается — только счётчик.
 */
@Injectable()
export class AiActivityService {
  constructor(private readonly repo: AiRepository) {}

  /** Сообщения ученика тьютору с указанного момента. */
  countTutorMessagesSince(userId: string, studentId: string, since: Date): Promise<number> {
    return this.repo.countUserMessagesSince(userId, studentId, since);
  }
}
