/**
 * Dev-only secrets controller.
 * Returns key ring info for AC4 verification.
 */

import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/tenant';
import { verifyChecksum } from '@verifynng/core';
import { SecretsKeyRing } from './secrets-key-ring.js';

@Controller('v1/_dev/keyring')
@Public()
export class DevSecretsController {
  constructor(private readonly keyRing: SecretsKeyRing) {}

  @Get()
  async getInfo() {
    return {
      activeKid: this.keyRing.getActiveKid(),
      kids: this.keyRing.getKids(),
    };
  }

  /**
   * AC4: confirms a code minted under a since-retired-from-active kid still
   * verifies after rotation, as long as that kid's secret hasn't been deleted.
   */
  @Get('verify')
  async verify(@Query('code') code: string) {
    const result = verifyChecksum(this.keyRing, code);
    return result;
  }
}
