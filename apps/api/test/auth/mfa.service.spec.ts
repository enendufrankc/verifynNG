import { describe, it, expect } from 'vitest';
import { generate } from 'otplib';
import { MfaService } from '../../src/modules/auth/services/mfa.service';

describe('MfaService', () => {
  it('generates a secret with a matching otpauth URI', () => {
    const service = new MfaService();
    const { secret, otpauthUri, encrypted } = service.generateSecret(
      'owner@ivoryglow.local',
    );
    expect(secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(otpauthUri).toContain('otpauth://totp/');
    expect(otpauthUri).toContain(encodeURIComponent('owner@ivoryglow.local'));
    expect(otpauthUri).toContain('VerifyNG');
    expect(encrypted).not.toBe(secret);
  });

  it('encrypts the secret such that it round-trips through verifyTotp', async () => {
    const service = new MfaService();
    const { secret, encrypted } = service.generateSecret('a@x.io');
    const code = await generate({ secret });
    await expect(service.verifyTotp(code, encrypted)).resolves.toBe(true);
  });

  it('rejects a code generated from a different secret', async () => {
    const service = new MfaService();
    const { encrypted } = service.generateSecret('a@x.io');
    const otherSecret = service.generateSecret('b@x.io').secret;
    const wrongCode = await generate({ secret: otherSecret });
    await expect(service.verifyTotp(wrongCode, encrypted)).resolves.toBe(false);
  });

  it('rejects a garbage code', async () => {
    const service = new MfaService();
    const { encrypted } = service.generateSecret('a@x.io');
    await expect(service.verifyTotp('000000', encrypted)).resolves.toBe(false);
  });

  it('accepts a code from one period in the past (drift tolerance)', async () => {
    const service = new MfaService();
    const { secret, encrypted } = service.generateSecret('a@x.io');
    const now = Math.floor(Date.now() / 1000);
    const pastCode = await generate({ secret, epoch: now - 30 });
    await expect(service.verifyTotp(pastCode, encrypted)).resolves.toBe(true);
  });

  it('rejects a code far outside the drift window', async () => {
    const service = new MfaService();
    const { secret, encrypted } = service.generateSecret('a@x.io');
    const now = Math.floor(Date.now() / 1000);
    const farCode = await generate({ secret, epoch: now - 300 });
    await expect(service.verifyTotp(farCode, encrypted)).resolves.toBe(false);
  });

  it('generates 10 recovery codes in XXXX-XXXX format', () => {
    const service = new MfaService();
    const codes = service.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
    expect(new Set(codes).size).toBe(10);
  });

  it('consumes a recovery code exactly once', async () => {
    const service = new MfaService();
    const codes = service.generateRecoveryCodes();
    const hashed = await service.hashRecoveryCodes(codes);

    const first = await service.consumeRecoveryCode(codes[0], hashed);
    expect(first.valid).toBe(true);
    expect(first.remaining).toHaveLength(9);

    const second = await service.consumeRecoveryCode(codes[0], first.remaining);
    expect(second.valid).toBe(false);
    expect(second.remaining).toHaveLength(9);
  });

  it('rejects a recovery code that was never issued', async () => {
    const service = new MfaService();
    const codes = service.generateRecoveryCodes();
    const hashed = await service.hashRecoveryCodes(codes);
    const result = await service.consumeRecoveryCode('FFFF-FFFF', hashed);
    expect(result.valid).toBe(false);
    expect(result.remaining).toEqual(hashed);
  });
});
