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
      this.logger.warn(
        `Secrets file not found: ${this.secretsFilePath}`,
      );
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
    } catch (err: any) {
      this.logger.error(`Failed to read secrets file: ${err.message}`);
    }

    return this.fileEntries;
  }
}
