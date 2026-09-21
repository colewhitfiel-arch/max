import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEventBus } from './domain-events';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: false, maxListeners: 50 })],
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class DomainEventsModule {}
