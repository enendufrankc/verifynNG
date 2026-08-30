/**
 * SecretsModule — provides SecretsPort, EnvFileSecrets, and SecretsKeyRing.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SECRETS_TOKEN } from './secrets.port.js';
import { EnvFileSecrets } from './env-file-secrets.js';
import { SecretsKeyRing } from './secrets-key-ring.js';
import { DevSecretsController } from './dev-secrets.controller.js';

const devControllers =
  process.env.NODE_ENV === 'production' ? [] : [DevSecretsController];

@Global()
@Module({
  controllers: [...devControllers],
  providers: [
    {
      provide: EnvFileSecrets,
      useFactory: (configService: ConfigService) => {
        const secretsFile = configService.get<string>('SECRETS_FILE')!;
        return new EnvFileSecrets(secretsFile);
      },
      inject: [ConfigService],
    },
    // Alias so other epics (E15/E18) can inject the port abstraction instead
    // of the concrete adapter.
    {
      provide: SECRETS_TOKEN,
      useExisting: EnvFileSecrets,
    },
    {
      provide: SecretsKeyRing,
      useFactory: async (
        envSecrets: EnvFileSecrets,
        configService: ConfigService,
      ) => {
        // getFromFile (not the SecretsPort.get() process.env-first lookup):
        // Nest's ConfigModule validate option writes the zod-defaulted
        // CORE_KEYS_JSON back into process.env, so a plain get() would
        // always see "set" there and never reach a real rotated file value.
        const coreKeysJson =
          (await envSecrets.getFromFile('CORE_KEYS_JSON')) ??
          configService.get<string>('CORE_KEYS_JSON')!;
        const legacyCoreKeys =
          (await envSecrets.getFromFile('CORE_KEYS')) ??
          configService.get<string>('CORE_KEYS');
        const legacyActiveKid =
          (await envSecrets.getFromFile('CORE_ACTIVE_KID')) ??
          configService.get<string>('CORE_ACTIVE_KID');
        return new SecretsKeyRing(
          coreKeysJson,
          legacyCoreKeys,
          legacyActiveKid,
        );
      },
      inject: [EnvFileSecrets, ConfigService],
    },
    // Alias so consumers can inject either the concrete class or the token.
    {
      provide: 'KEY_RING',
      useExisting: SecretsKeyRing,
    },
  ],
  exports: [SECRETS_TOKEN, 'KEY_RING', SecretsKeyRing],
})
export class SecretsModule {}
