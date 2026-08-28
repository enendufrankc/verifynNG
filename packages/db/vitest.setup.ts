import { config } from 'dotenv';
import { resolve } from 'node:path';

if (!process.env.DATABASE_URL) {
  config({ path: resolve(__dirname, '../../.env.example') });
}
