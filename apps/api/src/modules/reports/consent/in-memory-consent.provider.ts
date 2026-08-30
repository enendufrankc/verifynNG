import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConsentPort, RecordConsentInput } from './consent-port';

export interface InMemoryConsentRecord extends RecordConsentInput {
  consentId: string;
  createdAt: string;
}

// E19 (consent ledger) hasn't shipped yet. This in-memory adapter is the
// deliberate interim ConsentPort implementation for E08 — records live only
// for the process lifetime and are not persisted. Swap for E19's real
// adapter once it ships; the ConsentPort interface is the seam.
@Injectable()
export class InMemoryConsent implements ConsentPort {
  private records: InMemoryConsentRecord[] = [];

  async record(input: RecordConsentInput): Promise<string> {
    const consentId = randomUUID();
    this.records.push({
      ...input,
      consentId,
      createdAt: new Date().toISOString(),
    });
    return consentId;
  }

  list(): InMemoryConsentRecord[] {
    return this.records;
  }
}
