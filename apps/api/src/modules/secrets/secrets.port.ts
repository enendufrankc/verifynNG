/**
 * SecretsPort — abstract interface for reading secrets.
 *
 * EnvFileSecrets is the local/Docker implementation.
 * Production would swap in a vault adapter (AWS Secrets Manager, Cloudflare Secrets, etc.)
 */

export const SECRETS_TOKEN = Symbol('SECRETS_TOKEN');

export interface SecretsPort {
  /** Read a single secret by name. Checks process.env first, then the secrets file. */
  get(name: string): Promise<string | undefined>;
  /** List secret names matching a prefix. */
  list(prefix: string): Promise<string[]>;
}
