import { createHash } from 'node:crypto';
import { loadEnv } from '@verifynng/config';

/**
 * Consumers are never identified by raw email/IP in any table — this is
 * the one salted-hash function every consumer-facing subject reference
 * (ConsentRecord.subjectRef, DsarRequest.subjectRef) is derived from, so a
 * leaked reference alone never reveals the underlying email.
 */
export function hashConsumerSubject(email: string): string {
  const salt = loadEnv().CONSENT_SALT;
  return createHash('sha256')
    .update(`${email.trim().toLowerCase()}${salt}`)
    .digest('hex');
}
