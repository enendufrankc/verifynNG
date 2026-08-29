/**
 * Hashing for storage — the only thing stored for tier-2 codes.
 *
 * Uses SHA-256 hex digest. A database leak reveals nothing mintable.
 */

import crypto from 'node:crypto';

/**
 * Compute the SHA-256 hex hash of a code for database storage.
 * This is the only value ever stored for tier-2 codes.
 */
export function hashForStorage(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
