import { config } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults.
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../.env.example') });
