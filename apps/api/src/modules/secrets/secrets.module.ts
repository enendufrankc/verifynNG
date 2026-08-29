/**
 * SecretsModule — provides SecretsPort, EnvFileSecrets, and SecretsKeyRing.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SECRETS_TOKEN, SecretsPort } from './secrets.port.js';
import { EnvFileSecrets } from './env-file-secrets.js';
import { SecretsKeyRing } from './secrets-key-ring.js';
import type { KeyRing } from '@verifynng/core';

@Global()
@Module({
  providers: [
    {
      provide: SECRETS_TOKEN,
      useFactory: (configService: ConfigService) => {
        const secretsFile = configService.get<string>('SECRETS_FILE')!;
        return new EnvFileSecrets(secretsFile);
      },
      inject: [ConfigService],
    },
    {
      provide: 'KEY_RING',
      useFactory: (configService: ConfigService) => {
        const coreKeysJson = configService.get<string>('CORE_KEYS_JSON')!;
        const legacyCoreKeys = configService.get<string>('CORE_KEYS');
        const legacyActiveKid = configService.get<string>('CORE_ACTIVE_KID');
        return new SecretsKeyRing(coreKeysJson, legacyCoreKeys, legacyActiveKid);
      },
      inject: [ConfigService],
    },
    // Re-export SecretsKeyRing as a provider itself for direct injection
    {
      provide: SecretsKeyRing,
      useFactory: (configService: ConfigService) => {
        const coreKeysJson = configService.get<string>('CORE_KEYS_JSON')!;
        const legacyCoreKeys = configService.get<string>('CORE_KEYS');
        const legacyActiveKid = configService.get<string>('CORE_ACTIVE_KID');
        return new SecretsKeyRing(coreKeysJson, legacyCoreKeys, legacyActiveKid);
      },
      inject: [ConfigService],
    },
  ],
  exports: [SECRETS_TOKEN, 'KEY_RING', SecretsKeyRing],
})
export class SecretsModule {}
