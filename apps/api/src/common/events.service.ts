import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  // Explicit @Inject(EventEmitter2): esbuild (used by `pnpm --filter api
  // jobs:run`'s tsx) doesn't reliably emit design:paramtypes for every
  // constructor shape — plain type-based injection can resolve to
  // `undefined` at runtime under it even for a single parameter. `nest
  // build` (tsc, what actually ships) has no such issue.
  constructor(@Inject(EventEmitter2) private emitter: EventEmitter2) {}

  async emit(event: string, payload: unknown): Promise<void> {
    this.emitter.emit(event, payload);
  }
}
