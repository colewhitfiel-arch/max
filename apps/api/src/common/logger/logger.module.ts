import { Global, Module } from '@nestjs/common';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { AppLogger } from './logger.service';

@Global()
@Module({
  providers: [AppLogger, HttpLoggingInterceptor],
  exports: [AppLogger, HttpLoggingInterceptor],
})
export class LoggerModule {}
