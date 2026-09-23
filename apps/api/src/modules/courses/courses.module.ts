import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { GroupsModule } from '../groups/groups.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { StudentCoursesController } from './student-courses.controller';
import { StudentCoursesService } from './student-courses.service';

/** courses: структура курса, публикация (преподаватель) и прохождение курса учеником. */
@Module({
  imports: [GroupsModule, AssignmentsModule],
  controllers: [CoursesController, StudentCoursesController],
  providers: [CoursesService, StudentCoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
