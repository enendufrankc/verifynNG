/**
 * @verifynng/core — Pure code engine for the Verify Platform
 *
 * Zero I/O, zero framework, Node built-ins only.
 * Single source of truth for code generation, parsing, checksumming,
 * hashing, manifest signing, and key management.
 */

// Errors
export { InvalidCodeError, UnknownKeyError } from './errors.js';

// Alphabet & normalization
export {
  ALPHABET,
  encodeBase32,
  decodeBase32,
  normalizeCode,
} from './alphabet.js';

// Key management
export type { KeyRing } from './keys.js';
export { StaticKeyRing } from './keys.js';

// Code generation, parsing, verification
export type { Tier, ParsedCode } from './code.js';
export { generateCode, parseCode, verifyChecksum, redactCode } from './code.js';

// Hashing for storage
export { hashForStorage } from './hash.js';

// Batch watermarking
export { deriveBatchWatermark, watermarkOf } from './batch.js';

// Manifest signing
export type { SignedManifest } from './manifest.js';
export {
  canonicalize,
  signManifest,
  verifyManifest,
  receiptHash,
} from './manifest.js';

// GS1 Digital Link
export { toGs1DigitalLink, parseGs1DigitalLink } from './gs1.js';
