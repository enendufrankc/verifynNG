import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults —
// same lookup order as playwright.config.ts and the realistic seed. Without this, isolation
// and contract tests fall back to schema defaults (DATABASE_URL, S3_ENDPOINT, ...) instead of
// this worktree's actual offset ports and fail with ECONNREFUSED against the wrong service.
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../.env.example') });
