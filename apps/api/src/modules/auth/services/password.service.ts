import * as argon2 from 'argon2';
import { Injectable } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class PasswordService {
  private readonly mCost: number;
  private readonly tCost: number;
  private readonly pCost: number;

  constructor() {
    const env = loadEnv();
    this.mCost = env.ARGON2_M_COST;
    this.tCost = env.ARGON2_T_COST;
    this.pCost = env.ARGON2_P_COST;
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: 'argon2id' as any,
      memoryCost: this.mCost,
      timeCost: this.tCost,
      parallelism: this.pCost,
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      memoryCost: this.mCost,
      timeCost: this.tCost,
      parallelism: this.pCost,
    });
  }
}
