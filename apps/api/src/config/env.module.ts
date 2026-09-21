import { type DynamicModule, Global, Inject, Module } from '@nestjs/common';
import { type Env } from './env';

export const ENV = Symbol('ENV');

/** Инъекция валидированного окружения: `constructor(@InjectEnv() private readonly env: Env)`. */
export const InjectEnv = (): ParameterDecorator => Inject(ENV);

@Global()
@Module({})
export class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
