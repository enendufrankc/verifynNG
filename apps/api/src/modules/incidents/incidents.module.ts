import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentService } from './incident.service';

@Module({
  controllers: [IncidentsController],
  providers: [IncidentService],
  exports: [IncidentService],
})
export class IncidentsModule {}
