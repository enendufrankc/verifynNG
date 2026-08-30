import { Module, Global } from '@nestjs/common';
import { Metrics } from './metrics';

@Global()
@Module({
  providers: [
    {
      provide: Metrics,
      useValue: Metrics,
    },
  ],
  exports: [Metrics],
})
export class MetricsModule {}
