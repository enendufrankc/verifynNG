import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  // Not EventEmitterModule.forRoot() here — see the note in app.module.ts;
  // it's called exactly once app-wide, in common/events.module.ts.
  imports: [],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
