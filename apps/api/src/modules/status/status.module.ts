import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
