/**
 * Dev-only secrets controller.
 * Returns key ring info for AC4 verification.
 */

import { Controller, Get } from '@nestjs/common';
import { SecretsKeyRing } from './secrets-key-ring.js';

@Controller('v1/_dev/keyring')
export class DevSecretsController {
  constructor(private readonly keyRing: SecretsKeyRing) {}

  @Get()
  async getInfo() {
    return {
      activeKid: this.keyRing.getActiveKid(),
      kids: this.keyRing.getKids(),
    };
  }
}
