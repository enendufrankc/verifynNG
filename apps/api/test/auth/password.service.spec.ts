import { describe, it, expect } from 'vitest';
import { PasswordService } from '../../src/modules/auth/services/password.service';

describe('PasswordService', () => {
  it('hashes a password as an argon2id PHC string', async () => {
    const service = new PasswordService();
    const hash = await service.hash('Passw0rd!Passw0rd!');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifies a correct password against its hash', async () => {
    const service = new PasswordService();
    const hash = await service.hash('Passw0rd!Passw0rd!');
    await expect(service.verify('Passw0rd!Passw0rd!', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects an incorrect password', async () => {
    const service = new PasswordService();
    const hash = await service.hash('Passw0rd!Passw0rd!');
    await expect(service.verify('WrongPassword!1', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const service = new PasswordService();
    const hash1 = await service.hash('Passw0rd!Passw0rd!');
    const hash2 = await service.hash('Passw0rd!Passw0rd!');
    expect(hash1).not.toBe(hash2);
  });

  it('reports no rehash needed when params match current config', async () => {
    const service = new PasswordService();
    const hash = await service.hash('Passw0rd!Passw0rd!');
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('reports rehash needed when the hash used weaker params', async () => {
    const argon2 = await import('argon2');
    const weakHash = await argon2.hash('Passw0rd!Passw0rd!', {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 1,
      parallelism: 1,
    });
    const service = new PasswordService();
    expect(service.needsRehash(weakHash)).toBe(true);
  });
});
