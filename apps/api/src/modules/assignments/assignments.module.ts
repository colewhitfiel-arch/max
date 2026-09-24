import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { GroupsModule } from '../groups/groups.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsRepository } from './assignments.repository';
import { AssignmentsService } from './assignments.service';

/** assignments: задания и сдачи (workstream B, docs/07 F7). */
@Module({
  imports: [GroupsModule, FilesModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsRepository, AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
