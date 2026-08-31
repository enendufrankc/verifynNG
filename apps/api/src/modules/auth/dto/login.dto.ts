import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /** Tenant slug — resolves which Membership to log into and which tenant's
   * LoginPolicyHooks (enforce-SSO, MFA policy) apply. Optional for
   * backward compatibility: omitted, login falls back to the first
   * Membership found (pre-E20 behaviour). */
  @IsOptional()
  @IsString()
  tenant?: string;
}
