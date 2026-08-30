/**
 * EnvFileSecrets — reads secrets from process.env then a local env file.
 *
 * This is the compose/local adapter. Production swaps in a vault adapter.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SecretsPort } from './secrets.port.js';
import { readFileSync, existsSync } from 'node:fs';

@Injectable()
export class EnvFileSecrets implements SecretsPort {
  private readonly logger = new Logger(EnvFileSecrets.name);
  private fileEntries: Map<string, string> | null = null;

  constructor(private readonly secretsFilePath: string) {}

  async get(name: string): Promise<string | undefined> {
    // process.env takes priority
    if (process.env[name] !== undefined) {
      return process.env[name];
    }

    // Then the secrets file
    const entries = this.loadFile();
    return entries.get(name);
  }

  /**
   * Read a secret from the file only, ignoring process.env.
   *
   * Nest's ConfigModule `validate` option writes the zod-defaulted config
   * back into process.env, so a key with a schema default (like
   * CORE_KEYS_JSON) always appears "set" there even when no operator ever
   * provided it — get()'s process.env-first behavior would otherwise always
   * shadow a real rotated file value. Callers that need "does the rotation
   * file actually have this" (e.g. SecretsKeyRing) use this instead.
   */
  async getFromFile(name: string): Promise<string | undefined> {
    const entries = this.loadFile();
    return entries.get(name);
  }

  async list(prefix: string): Promise<string[]> {
    const entries = this.loadFile();
    const envKeys = Object.keys(process.env).filter((k) =>
      k.startsWith(prefix),
    );
    const fileKeys = Array.from(entries.keys()).filter((k) =>
      k.startsWith(prefix),
    );
    return [...new Set([...envKeys, ...fileKeys])];
  }

  private loadFile(): Map<string, string> {
    if (this.fileEntries) return this.fileEntries;

    this.fileEntries = new Map();

    if (!existsSync(this.secretsFilePath)) {
      this.logger.warn(`Secrets file not found: ${this.secretsFilePath}`);
      return this.fileEntries;
    }

    try {
      const content = readFileSync(this.secretsFilePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();

        // Remove surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        this.fileEntries.set(key, value);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to read secrets file: ${message}`);
    }

    return this.fileEntries;
  }
}
