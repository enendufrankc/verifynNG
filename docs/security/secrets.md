# Secrets management

## The abstraction

`SecretsPort` (`apps/api/src/modules/secrets/secrets.port.ts`) is the only
interface the rest of the API talks to for reading secret material:

```ts
interface SecretsPort {
  get(name: string): Promise<string | undefined>;
  list(prefix: string): Promise<string[]>;
}
```

`EnvFileSecrets` is the local/Docker Compose implementation: it checks
`process.env` first, then a local env file (`SECRETS_FILE`, defaulting to
`docker/secrets/local.env`, git-ignored). It's bound to `SECRETS_TOKEN` in
`SecretsModule` and exported for other epics (E15, E18) to read their own
provider secrets (payment gateway keys, support-tool credentials, …) through
the same port rather than reaching into `process.env` directly.

`SecretsKeyRing` (implements `@verifynng/core`'s `KeyRing`) is the one
consumer that currently needs the _file specifically_ rather than the
general env-first lookup — see the note in `secrets.module.ts` about why:
Nest's `ConfigModule` `validate` option writes the zod-defaulted config back
into `process.env`, so a schema-defaulted key (like `CORE_KEYS_JSON`) always
looks "set" there even before an operator ever rotates it. `EnvFileSecrets`
exposes `getFromFile()` for exactly this case.

## The swap point

Moving to a managed vault means implementing `SecretsPort` once and changing
one provider binding in `SecretsModule`:

```ts
// apps/api/src/modules/secrets/secrets.module.ts
{
  provide: EnvFileSecrets,           // ← swap this class
  useFactory: (configService: ConfigService) => {
    const secretsFile = configService.get<string>('SECRETS_FILE')!;
    return new EnvFileSecrets(secretsFile);
  },
  inject: [ConfigService],
},
```

becomes, for example:

```ts
{
  provide: SECRETS_TOKEN,
  useFactory: (configService: ConfigService) =>
    new AwsSecretsManagerAdapter({
      region: configService.get<string>('AWS_REGION')!,
      secretPrefix: 'verifynng/',
    }),
  inject: [ConfigService],
},
```

Everything downstream (`SecretsKeyRing`, any future consumer injecting
`SECRETS_TOKEN`) is unaffected as long as the new adapter satisfies
`SecretsPort`.

### Sketch: AWS Secrets Manager

```ts
class AwsSecretsManagerAdapter implements SecretsPort {
  constructor(
    private readonly opts: { region: string; secretPrefix: string },
  ) {}

  async get(name: string): Promise<string | undefined> {
    const client = new SecretsManagerClient({ region: this.opts.region });
    try {
      const res = await client.send(
        new GetSecretValueCommand({
          SecretId: `${this.opts.secretPrefix}${name}`,
        }),
      );
      return res.SecretString;
    } catch (err) {
      if (err instanceof ResourceNotFoundException) return undefined;
      throw err;
    }
  }

  async list(prefix: string): Promise<string[]> {
    // ListSecrets with a Name filter on `${this.opts.secretPrefix}${prefix}`
  }
}
```

### Sketch: Cloudflare Secrets (Workers / Wrangler bindings)

Cloudflare Secrets aren't readable at runtime by name the way a vault API
is — they're bound directly into `env` at deploy time. A `SecretsPort`
adapter there is mostly a thin wrapper validating that the expected bindings
exist:

```ts
class CloudflareSecretsAdapter implements SecretsPort {
  constructor(private readonly env: Record<string, string | undefined>) {}

  async get(name: string): Promise<string | undefined> {
    return this.env[name];
  }

  async list(prefix: string): Promise<string[]> {
    return Object.keys(this.env).filter((k) => k.startsWith(prefix));
  }
}
```

Rotation for Cloudflare Secrets is a `wrangler secret put` + redeploy, not a
file rewrite — `pnpm secrets:rotate-core-key` (see
`docs/security/key-rotation-runbook.md`) would need a Cloudflare-specific
sibling command rather than reuse, since it fundamentally isn't editing a
file the running process reads.

## What never happens

- A raw tier-2 code is never stored anywhere except inside a signed
  manifest. It never appears in `SecretsPort`, logs, or the audit log
  (`AuditService`'s `REDACT_KEYS` list includes `code`).
- Kids are never deleted from `CORE_KEYS_JSON` — see the retirement
  checklist in `docs/security/key-rotation-runbook.md`.
