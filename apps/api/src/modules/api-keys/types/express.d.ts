import type { VerifiedApiKey } from '../api-key.service';

// Merges into E02's `Express.Request` augmentation (auth/types/express.d.ts) —
// a separate `declare global` block in a different file, not an edit to theirs.
declare global {
  namespace Express {
    interface Request {
      apiKey?: VerifiedApiKey;
    }
  }
}
