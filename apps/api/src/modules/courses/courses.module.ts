import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';

/** courses: публичный сервис (создание курса из черновика). Ручки курсов — workstream B. */
@Module({
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
