import { Global, Module } from '@nestjs/common';
import { KV_STORE, MemoryKeyValueStore } from './key-value-store';

@Global()
@Module({
  providers: [{ provide: KV_STORE, useFactory: () => new MemoryKeyValueStore() }],
  exports: [KV_STORE],
})
export class KvModule {}
