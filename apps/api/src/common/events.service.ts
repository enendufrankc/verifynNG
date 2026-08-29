import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  constructor(private emitter: EventEmitter2) {}

  async emit(event: string, payload: unknown): Promise<void> {
    this.emitter.emit(event, payload);
  }
}
