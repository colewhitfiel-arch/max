import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { GroupsModule } from '../groups/groups.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

/** courses: структура курса, дополнение модулями и публикация. Экраны ученика — workstream B. */
@Module({
  imports: [GroupsModule, AssignmentsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
