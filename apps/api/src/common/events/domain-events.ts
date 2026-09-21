import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { type DomainEventName, type DomainEventPayload, DomainEventSchemas } from '@edu/contracts';
import { AppLogger } from '../logger/logger.service';

/**
 * Типизированная шина доменных событий (docs/05 §5.4). Внутри процесса — EventEmitter2;
 * тяжёлые обработчики ставят job в JobQueue. Payload валидируется схемой контракта.
 */
@Injectable()
export class DomainEventBus {
  private readonly log;

  constructor(
    private readonly emitter: EventEmitter2,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'events' });
  }

  async emit<N extends DomainEventName>(name: N, payload: DomainEventPayload<N>): Promise<void> {
    const parsed = DomainEventSchemas[name].safeParse(payload);
    if (!parsed.success) {
      this.log.error({ event: name, issues: parsed.error.issues }, 'невалидный payload события');
      throw new Error(`Невалидный payload события ${name}`);
    }
    this.log.debug({ event: name }, 'emit');
    await this.emitter.emitAsync(name, parsed.data);
  }
}

/** Подписка на доменное событие: `@OnDomainEvent('attendance.marked') handle(p: DomainEventPayload<'attendance.marked'>)`. */
export const OnDomainEvent = (name: DomainEventName): MethodDecorator =>
  OnEvent(name, { async: true, promisify: true, suppressErrors: false });
