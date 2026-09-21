import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { FilesModule } from '../files/files.module';
import { GroupsModule } from '../groups/groups.module';
import { CourseBuilderController } from './course-builder.controller';
import { CourseBuilderJobs } from './course-builder.jobs';
import { CourseBuilderRepository } from './course-builder.repository';
import { CourseBuilderService } from './course-builder.service';
import { CourseGenerator } from './pipeline/generator';
import { CoursePipelineRunner } from './pipeline/runner';

/** course-builder: пайплайн «материал/тема → атомы → узлы → уроки» на GigaChat (workstream G). */
@Module({
  imports: [FilesModule, GroupsModule, CoursesModule],
  controllers: [CourseBuilderController],
  providers: [
    CourseBuilderRepository,
    CourseGenerator,
    CoursePipelineRunner,
    CourseBuilderService,
    CourseBuilderJobs,
  ],
  exports: [CourseBuilderService],
})
export class CourseBuilderModule {}
