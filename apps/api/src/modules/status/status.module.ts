import { Module } from '@nestjs/common';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  // Not EventEmitterModule.forRoot() here — see the note in app.module.ts;
  // it's called exactly once app-wide, in common/events.module.ts.
  imports: [],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
