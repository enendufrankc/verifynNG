# E02 Identity & Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full authN/authZ system for the Verify Platform: email+password registration/login, JWT access + opaque rotating refresh tokens, TOTP MFA, RBAC per tenant with server-derived tenant context, service-to-service auth, session management, password reset, and cross-tenant isolation harness.

**Architecture:** NestJS modules (`AuthModule`, `MembersModule`) under `apps/api/src/modules/`. Global guards (`TenantContextGuard`, `RolesGuard`) enforce auth on every route. Custom decorators (`@TenantId()`, `@Principal()`, `@Roles()`, `@Public()`, `@PlatformRole()`, `@InternalOnly()`) control access. JWTs use E01's `StaticKeyRing` pattern for key rotation. Refresh tokens are opaque, stored hashed with E01's `hashForStorage()`. Prisma models added in an E02 block. Env vars added in an E02 section of `packages/config/src/env-schema.ts`.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL 16, Redis 7, JWT (jsonwebtoken), argon2, otplib, nodemailer, Vitest, BullMQ (later; events via Nest EventEmitter2 for now)

**Ports for this worktree:** API=4206, Postgres=5638, Redis=6585, Mailpit UI=8231, Mailpit SMTP=1231

---

## Task Dependency Graph

```
T1 (schema+env) ──► T2 (PasswordService+Register) ──► T3 (TokenService+Login/Refresh)
                                                       │
                                                       ▼
                                          T4 (Guards+Decorators+Me/Switch)
                                           │          │
                                           ▼          ▼
                                    T5 (Members)   T6 (MFA)
                                           │          │
                                           ▼          ▼
                                    T7 (Password Reset/Change) ──► T8 (Sessions)
                                                                       │
                                    T9 (ApiClient+InternalOnly) ◄──────┘
                                           │
                                           ▼
                                    T10 (PlatformRole support)
                                           │
                                           ▼
                                    T11 (Isolation Harness)
                                           │
                                           ▼
                                    T12 (HTTP Collection + Docs + Seed)
```

---

## File Structure

### New files (owned paths)

```
apps/api/src/modules/auth/
  auth.module.ts
  auth.controller.ts
  auth.service.ts
  dto/
    register.dto.ts
    login.dto.ts
    refresh.dto.ts
    switch-tenant.dto.ts
    mfa-challenge.dto.ts
    mfa-enable.dto.ts
    mfa-disable.dto.ts
    forgot-password.dto.ts
    reset-password.dto.ts
    change-password.dto.ts
  services/
    password.service.ts
    token.service.ts
    mfa.service.ts
  guards/
    tenant-context.guard.ts
    roles.guard.ts
    internal-only.guard.ts
  decorators/
    tenant-id.decorator.ts        (replaces E00 placeholder)
    principal.decorator.ts
    roles.decorator.ts
    public.decorator.ts
    platform-role.decorator.ts
    internal-only.decorator.ts
  strategies/
    jwt.strategy.ts
    api-client.strategy.ts
  mailer/
    mailer.interface.ts
    smtp-mailer.service.ts

apps/api/src/modules/members/
  members.module.ts
  members.controller.ts
  members.service.ts
  dto/
    invite.dto.ts
    change-role.dto.ts

apps/api/src/common/tenant/
  tenant-context.guard.ts         (re-export from auth module for convenience)
  index.ts                        (barrel export for all decorators)

packages/db/src/testing/
  tenant-isolation.ts

apps/api/test/
  isolation/
    E02.isolation.spec.ts
  auth/
    password.service.spec.ts
    token.service.spec.ts
    mfa.service.spec.ts
    guards.spec.ts
    auth.integration.spec.ts
    members.integration.spec.ts

apps/api/http/
  auth.http

docs/auth.md
```

### Modified files (shared hot-spots)

```
packages/db/prisma/schema.prisma       (additive E02 block)
packages/config/src/env-schema.ts      (additive E02 section)
packages/db/src/index.ts               (re-export tenant-isolation)
apps/api/src/app.module.ts             (one import line for AuthModule, MembersModule)
apps/api/src/common/tenant-id.decorator.ts  (DELETE — replaced by modules/auth version)
apps/api/src/common/tenant-id.decorator.spec.ts  (DELETE)
docker/compose.yml                     (add E02 env vars to api service)
.env.example                           (add E02 section)
packages/db/prisma/seed.ts             (add users + memberships)
```

---

### Task 1: Schema + Migration + Env

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/config/src/env-schema.ts`
- Modify: `.env.example`
- Modify: `docker/compose.yml` (add E02 env vars to api service)

- [ ] **Step 1: Add E02 Prisma models**

Add to `packages/db/prisma/schema.prisma` after the E00 block:

```prisma
// ─── E02 Identity & Access ────────────────────────────────────────

enum TenantRole   { owner operator viewer }
enum PlatformRole { support }

// Extend E00 User with auth fields
// NOTE: passwordHash already exists in E00 schema; adding auth-specific fields
model User {
  // E00 fields remain: id, tenantId, email, passwordHash, displayName, createdAt, updatedAt, tenant

  // E02 additions:
  mfaEnabled       Boolean          @default(false)
  mfaSecret        String?          // base32, AES-GCM encrypted with MFA_ENC_KEY
  recoveryCodes    String[]         // argon2 hashes of unused codes
  platformRole     PlatformRole?
  lastLoginAt      DateTime?
  failedLoginCount Int              @default(0)
  lockedUntil      DateTime?
  memberships      Membership[]
  sessions         Session[]
  passwordResetTokens PasswordResetToken[]
}

model Membership {
  id        String     @id @default(cuid())
  userId    String
  tenantId  String
  role      TenantRole
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([userId, tenantId])
  @@index([tenantId, role])
}

model Session {
  id               String     @id @default(cuid())
  userId           String
  tenantId         String?            // active tenant at issue time
  refreshTokenHash String     @unique // hashForStorage(rawToken); rotated on every /auth/refresh
  familyId         String            // stable across rotations; reuse of superseded hash revokes the family
  userAgent        String?
  ipPrefix         String?           // /24 or /48 truncated per E19
  createdAt        DateTime   @default(now())
  lastSeenAt       DateTime   @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  revokedReason    String?
  user             User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, revokedAt])
  @@index([familyId])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime                     // 30 min
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model ApiClient {
  id         String    @id @default(cuid())
  tenantId   String?                     // null = platform-level (jobs, fakes)
  name       String
  keyHash    String    @unique          // hashForStorage(rawKey); rawKey shown once
  keyPrefix  String                      // first 8 chars for display
  scopes     String[]
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
  @@index([tenantId])
}
```

IMPORTANT: The E00 `User` model already has `passwordHash String?`. We must MERGE the E02 additions into the existing User model rather than redeclaring it. The same applies to `Tenant` which gets a `memberships` relation. Remove the duplicate `User` declaration and add only the new fields to the existing model.

- [ ] **Step 2: Add E02 env vars to env-schema.ts**

Add after the E00 section in `packages/config/src/env-schema.ts`:

```ts
// ── E02 Identity & Access ──────────────────────────────────────
const e02Schema = e00Schema.extend({
  JWT_KEYS: z
    .string()
    .default(
      'k1:0000000000000000000000000000000000000000000000000000000000000000',
    ),
  JWT_ACTIVE_KID: z.string().default('k1'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),
  MFA_ENC_KEY: z.string().default('00000000000000000000000000000000'), // 32 hex chars = 16 bytes
  ARGON2_M_COST: z.coerce.number().default(65536), // 64 MiB
  ARGON2_T_COST: z.coerce.number().default(3),
  ARGON2_P_COST: z.coerce.number().default(4),
  INTERNAL_API_KEYS: z.string().default(''),
  APP_BASE_URL: z.string().default('http://localhost:3001'),
});
```

Update `envSchema` export to use `e02Schema`.

- [ ] **Step 3: Add E02 section to `.env.example`**

```
# ── E02 Identity & Access ──────────────────────────────────
JWT_KEYS=k1:0000000000000000000000000000000000000000000000000000000000000000
JWT_ACTIVE_KID=k1
JWT_ACCESS_TTL=15m
REFRESH_TTL=30d
MFA_ENC_KEY=00000000000000000000000000000000
ARGON2_M_COST=65536
ARGON2_T_COST=3
ARGON2_P_COST=4
INTERNAL_API_KEYS=
APP_BASE_URL=http://localhost:3001
```

- [ ] **Step 4: Add E02 env vars to docker compose api service**

Add to the `api` service environment in `docker/compose.yml`:

```yaml
JWT_KEYS: k1:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2,k2:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5
JWT_ACTIVE_KID: k1
JWT_ACCESS_TTL: 15m
REFRESH_TTL: 30d
MFA_ENC_KEY: aabbccdd11223344aabbccdd11223344
ARGON2_M_COST: '65536'
ARGON2_T_COST: '3'
ARGON2_P_COST: '4'
INTERNAL_API_KEYS: fake-sms:key1_sms,fake-pay:key1_pay,fake-geo:key1_geo,worker:key1_worker
APP_BASE_URL: http://localhost:3001
```

Also add to `db-migrate` service (just DATABASE_URL is enough; seed doesn't need JWT vars).

- [ ] **Step 5: Generate Prisma migration**

Run:

```bash
cd packages/db && npx prisma migrate dev --name E02_identity
```

- [ ] **Step 6: Run pre-push checks**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(E02): T1 schema + migration + env vars"
```

---

### Task 2: PasswordService + POST /auth/register

**Files:**

- Create: `apps/api/src/modules/auth/auth.module.ts`
- Create: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/services/password.service.ts`
- Create: `apps/api/src/modules/auth/dto/register.dto.ts`
- Create: `apps/api/src/modules/auth/guards/tenant-context.guard.ts` (placeholder for now)
- Create: `apps/api/src/modules/auth/guards/roles.guard.ts` (placeholder for now)
- Create: `apps/api/src/modules/auth/decorators/public.decorator.ts`
- Modify: `apps/api/src/app.module.ts` (add AuthModule import)

- [ ] **Step 1: Install dependencies**

```bash
cd apps/api && pnpm add argon2 jsonwebtoken @nestjs/passport @nestjs/jwt passport passport-jwt otplib qrcode nodemailer && pnpm add -D @types/jsonwebtoken @types/passport-jwt @types/qrcode @types/nodemailer
```

- [ ] **Step 2: Write PasswordService unit test**

Create `apps/api/test/auth/password.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService } from '../../../src/modules/auth/services/password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService({ mCost: 65536, tCost: 3, pCost: 4 });
  });

  it('hashes and verifies a password', async () => {
    const hash = await service.hash('Passw0rd!Passw0rd!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify('Passw0rd!Passw0rd!', hash)).toBe(true);
    expect(await service.verify('wrong', hash)).toBe(false);
  });

  it('detects when rehash is needed (params changed)', async () => {
    const hash = await service.hash('Passw0rd!Passw0rd!');
    expect(service.needsRehash(hash)).toBe(false);
    const cheapService = new PasswordService({
      mCost: 4096,
      tCost: 1,
      pCost: 1,
    });
    expect(cheapService.needsRehash(hash)).toBe(true);
  });

  it('rejects passwords shorter than 12 chars in DTO', async () => {
    // This tests the DTO validation, but verify hash works for valid ones
    const hash = await service.hash('12chars_min!!');
    expect(await service.verify('12chars_min!!', hash)).toBe(true);
  });
});
```

- [ ] **Step 3: Implement PasswordService**

Create `apps/api/src/modules/auth/services/password.service.ts`:

```ts
import * as argon2 from 'argon2';
import { Injectable } from '@nestjs/common';

export interface Argon2Params {
  mCost: number;
  tCost: number;
  pCost: number;
}

@Injectable()
export class PasswordService {
  private readonly params: Argon2Params;

  constructor(params?: Argon2Params) {
    this.params = params ?? { mCost: 65536, tCost: 3, pCost: 4 };
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.params.mCost,
      timeCost: this.params.tCost,
      parallelism: this.params.pCost,
    });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      type: argon2.argon2id,
      memoryCost: this.params.mCost,
      timeCost: this.params.tCost,
      parallelism: this.params.pCost,
    });
  }
}
```

- [ ] **Step 4: Run PasswordService test**

```bash
cd apps/api && pnpm vitest run test/auth/password.service.spec.ts
```

- [ ] **Step 5: Create RegisterDto**

Create `apps/api/src/modules/auth/dto/register.dto.ts`:

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  displayName!: string;
}
```

- [ ] **Step 6: Create @Public() decorator (needed for register/login)**

Create `apps/api/src/modules/auth/decorators/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 7: Create minimal TenantContextGuard placeholder (allows all for now, T4 fills in)**

Create `apps/api/src/modules/auth/guards/tenant-context.guard.ts`:

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // T4 will implement real JWT validation
    // For now, allow all requests
    return true;
  }
}
```

- [ ] **Step 8: Create RolesGuard placeholder**

Create `apps/api/src/modules/auth/guards/roles.guard.ts`:

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // T4 will implement real role checking
    return true;
  }
}
```

- [ ] **Step 9: Create AuthService with register method**

Create `apps/api/src/modules/auth/auth.service.ts`:

```ts
import { Injectable, ConflictException, EventEmitter2 } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PasswordService } from './services/password.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private passwordService: PasswordService,
    private eventEmitter: EventEmitter2,
  ) {}

  async register(email: string, password: string, displayName: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName },
    });

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
      at: new Date(),
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _ph, ...result } = user;
    return result;
  }
}
```

- [ ] **Step 10: Create AuthController with register endpoint**

Create `apps/api/src/modules/auth/auth.controller.ts`:

```ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.displayName);
  }
}
```

- [ ] **Step 11: Create AuthModule**

Create `apps/api/src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, PrismaClient],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
```

- [ ] **Step 12: Register AuthModule in AppModule**

Modify `apps/api/src/app.module.ts` — add `AuthModule` to imports:

```ts
import { AuthModule } from './modules/auth/auth.module';
// ... in imports array:
AuthModule,
```

- [ ] **Step 13: Register guards globally in AppModule**

Add guard providers to `AppModule`:

```ts
import { APP_GUARD } from '@nestjs/core';
import { TenantContextGuard } from './modules/auth/guards/tenant-context.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

// In @Module providers:
{ provide: APP_GUARD, useClass: TenantContextGuard },
{ provide: APP_GUARD, useClass: RolesGuard },
```

- [ ] **Step 14: Run tests and commit**

```bash
cd apps/api && pnpm vitest run test/auth/password.service.spec.ts
pnpm lint && pnpm typecheck && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T2 PasswordService + POST /auth/register"
```

---

### Task 3: TokenService + Login/Refresh/Logout

**Files:**

- Create: `apps/api/src/modules/auth/services/token.service.ts`
- Create: `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/modules/auth/dto/login.dto.ts`
- Create: `apps/api/src/modules/auth/dto/refresh.dto.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (add login/refresh/logout)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (add routes)
- Modify: `apps/api/src/modules/auth/auth.module.ts` (add JwtModule, PassportModule)
- Modify: `apps/api/src/modules/auth/guards/tenant-context.guard.ts` (real JWT validation)
- Test: `apps/api/test/auth/token.service.spec.ts`

- [ ] **Step 1: Write TokenService unit test**

Create `apps/api/test/auth/token.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenService } from '../../../src/modules/auth/services/token.service';
import { StaticKeyRing, hashForStorage } from '@verifynng/core';
import { PrismaClient } from '@prisma/client';

// We'll mock PrismaClient for unit tests
describe('TokenService', () => {
  let tokenService: TokenService;
  const keyRing = new StaticKeyRing(
    'k1:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  );

  beforeEach(() => {
    const mockPrisma = {
      session: {
        create: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      user: {
        update: vi.fn(),
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    tokenService = new TokenService(mockPrisma, keyRing, {
      accessTtl: '15m',
      refreshTtlDays: 30,
    });
  });

  it('issues an access token with correct claims', async () => {
    const token = await tokenService.issueAccessToken({
      userId: 'user1',
      tenantId: 'tenant1',
      role: 'owner',
      sessionId: 'sess1',
    });
    const decoded = tokenService.verifyAccessToken(token);
    expect(decoded.sub).toBe('user1');
    expect(decoded.tid).toBe('tenant1');
    expect(decoded.role).toBe('owner');
    expect(decoded.sid).toBe('sess1');
    expect(decoded.kid).toBe('k1');
  });

  it('access token expires in 15 minutes', async () => {
    const token = await tokenService.issueAccessToken({
      userId: 'user1',
      tenantId: 'tenant1',
      role: 'owner',
      sessionId: 'sess1',
    });
    const decoded = tokenService.verifyAccessToken(token);
    expect(decoded.exp - decoded.iat).toBe(900);
  });

  it('token signed with k1 verifies after k2 becomes active', async () => {
    const twoKeyRing = new StaticKeyRing(
      'k1:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2,k2:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
      'k1',
    );
    const serviceK1 = new TokenService({} as PrismaClient, twoKeyRing, {
      accessTtl: '15m',
      refreshTtlDays: 30,
    });
    const token = await serviceK1.issueAccessToken({
      userId: 'u1',
      tenantId: 't1',
      role: 'owner',
      sessionId: 's1',
    });

    // Now rotate: k2 becomes active
    const twoKeyRing2 = new StaticKeyRing(
      'k1:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2,k2:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
      'k2',
    );
    const serviceK2 = new TokenService({} as PrismaClient, twoKeyRing2, {
      accessTtl: '15m',
      refreshTtlDays: 30,
    });
    const decoded = serviceK2.verifyAccessToken(token);
    expect(decoded.sub).toBe('u1');
  });

  it('generates a 256-bit opaque refresh token', () => {
    const token = tokenService.generateRefreshToken();
    const bytes = Buffer.from(token, 'hex');
    expect(bytes.length).toBe(32); // 256 bits
  });

  it('hashForStorage produces consistent hashes', () => {
    const token = tokenService.generateRefreshToken();
    const hash1 = hashForStorage(token);
    const hash2 = hashForStorage(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });
});
```

- [ ] **Step 2: Implement TokenService**

Create `apps/api/src/modules/auth/services/token.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { hashForStorage, type KeyRing } from '@verifynng/core';
import crypto from 'node:crypto';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  platformRole?: string;
  sessionId: string;
}

export interface DecodedToken {
  sub: string;
  tid: string;
  role: string;
  prole?: string;
  sid: string;
  kid: string;
  iat: number;
  exp: number;
}

export interface TokenServiceConfig {
  accessTtl: string;
  refreshTtlDays: number;
}

@Injectable()
export class TokenService {
  private readonly accessTtl: string;
  private readonly refreshTtlDays: number;

  constructor(
    private prisma: PrismaClient,
    private keyRing: KeyRing,
    private config: TokenServiceConfig,
  ) {
    this.accessTtl = config.accessTtl;
    this.refreshTtlDays = config.refreshTtlDays;
  }

  async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    const { kid, secret } = this.keyRing.active();
    const jwtService = new (require('@nestjs/jwt').JwtService)();
    return jwtService.sign(
      {
        sub: payload.userId,
        tid: payload.tenantId,
        role: payload.role,
        prole: payload.platformRole,
        sid: payload.sessionId,
      },
      {
        secret: Buffer.from(secret),
        expiresIn: this.accessTtl,
        keyid: kid,
      },
    );
  }

  verifyAccessToken(token: string): DecodedToken {
    // Try each key in the keyring
    const jwt = require('jsonwebtoken');
    let lastError: Error | null = null;

    // We need to know all kid values to try; decode header first
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      throw new UnauthorizedException('Invalid token');
    }

    const kid = decoded.header.kid;
    const secret = this.keyRing.get(kid);
    if (!secret) {
      throw new UnauthorizedException('Unknown signing key');
    }

    try {
      const payload = jwt.verify(token, Buffer.from(secret));
      return { ...payload, kid };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createSession(
    userId: string,
    tenantId: string | null,
    refreshToken: string,
    userAgent?: string,
    ipPrefix?: string,
  ): Promise<{ id: string; familyId: string }> {
    const hash = hashForStorage(refreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTtlDays);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: hash,
        familyId,
        userAgent,
        ipPrefix,
        expiresAt,
      },
    });

    return { id: session.id, familyId };
  }

  async rotateRefreshToken(
    oldRefreshToken: string,
    userAgent?: string,
    ipPrefix?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    session: { id: string };
  }> {
    const oldHash = hashForStorage(oldRefreshToken);

    // Find the session by the old refresh token hash
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: oldHash },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException({ error: 'refresh_reuse_detected' });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Check if this hash is different from current (reuse detected!)
    // If someone presents an old (superseded) hash, the session was already rotated
    // We detect reuse: if oldHash doesn't match the current hash for this family,
    // it means the family was already rotated — revoke everything
    const currentSession = await this.prisma.session.findFirst({
      where: { familyId: session.familyId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (currentSession && currentSession.refreshTokenHash !== oldHash) {
      // REUSE DETECTED — revoke the entire family
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'reuse-detected' },
      });

      this.emitRevokeEvent(session.userId, session.id, 'reuse-detected');

      throw new UnauthorizedException({ error: 'refresh_reuse_detected' });
    }

    // Generate new refresh token
    const newRefreshToken = this.generateRefreshToken();
    const newHash = hashForStorage(newRefreshToken);

    // Update the session with the new hash
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        lastSeenAt: new Date(),
        userAgent: userAgent ?? session.userAgent,
        ipPrefix: ipPrefix ?? session.ipPrefix,
      },
    });

    // Get user's membership for tenant context
    const membership = await this.prisma.membership.findFirst({
      where: { userId: session.userId },
    });

    const tenantId = membership?.tenantId ?? session.tenantId ?? '';
    const role = membership?.role ?? 'viewer';

    const accessToken = await this.issueAccessToken({
      userId: session.userId,
      tenantId,
      role,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      session: { id: session.id },
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    reason: string = 'user',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    this.emitRevokeEvent(userId, sessionId, reason);
  }

  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
    reason: string = 'user',
  ): Promise<void> {
    const where: any = { userId, revokedAt: null };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }
    await this.prisma.session.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private emitRevokeEvent(userId: string, sessionId: string, by: string): void {
    // Will be wired to EventEmitter2 in the service layer
  }
}
```

- [ ] **Step 3: Create JWT strategy**

Create `apps/api/src/modules/auth/strategies/jwt.strategy.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { StaticKeyRing } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const env = loadEnv();
    const keyRing = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        try {
          const decoded = JSON.parse(
            Buffer.from(rawJwtToken.split('.')[0], 'base64url').toString(),
          );
          const secret = keyRing.get(decoded.kid);
          if (!secret) {
            return done(
              new UnauthorizedException('Unknown signing key'),
              false,
            );
          }
          done(null, Buffer.from(secret));
        } catch (err) {
          done(new UnauthorizedException('Invalid token'), false);
        }
      },
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      platformRole: payload.prole,
      sessionId: payload.sid,
    };
  }
}
```

- [ ] **Step 4: Create login/refresh DTOs**

Create `apps/api/src/modules/auth/dto/login.dto.ts`:

```ts
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

Create `apps/api/src/modules/auth/dto/refresh.dto.ts`:

```ts
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
```

- [ ] **Step 5: Add login/refresh/logout to AuthService**

Add methods to `AuthService`:

```ts
async login(email: string, password: string, userAgent?: string, ip?: string) {
  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    this.eventEmitter.emit('user.login.failed', {
      emailHash: hashForStorage(email),
      ipHash: ip ? hashForStorage(ip) : null,
      reason: 'locked',
      at: new Date(),
    });
    throw new UnauthorizedException('Account locked');
  }

  const valid = await this.passwordService.verify(password, user.passwordHash);
  if (!valid) {
    await this.handleFailedLogin(user);
    throw new UnauthorizedException('Invalid credentials');
  }

  // Check if MFA required
  if (user.mfaEnabled) {
    const mfaToken = await this.tokenService.issueMfaToken(user.id);
    return { mfaRequired: true, mfaToken };
  }

  return this.completeLogin(user, userAgent, ip);
}

private async handleFailedLogin(user: any) {
  const newCount = user.failedLoginCount + 1;
  const lockUntil = newCount >= 10
    ? new Date(Date.now() + 15 * 60 * 1000) // 15 min
    : null;

  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: newCount,
      lockedUntil: lockUntil,
    },
  });

  this.eventEmitter.emit('user.login.failed', {
    emailHash: hashForStorage(user.email),
    reason: newCount >= 10 ? 'locked' : 'password',
    at: new Date(),
  });
}

private async completeLogin(user: any, userAgent?: string, ip?: string, mfaUsed = false) {
  // Reset failed login count
  await this.prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // Determine tenant context
  const memberships = await this.prisma.membership.findMany({
    where: { userId: user.id },
  });
  const activeMembership = memberships[0]; // first or last-used
  const tenantId = activeMembership?.tenantId ?? '';
  const role = activeMembership?.role ?? 'viewer';

  // Create session
  const refreshToken = this.tokenService.generateRefreshToken();
  const ipPrefix = ip ? this.truncateIp(ip) : undefined;
  const { id: sessionId } = await this.tokenService.createSession(
    user.id, tenantId, refreshToken, userAgent, ipPrefix,
  );

  const accessToken = await this.tokenService.issueAccessToken({
    userId: user.id,
    tenantId,
    role,
    platformRole: user.platformRole ?? undefined,
    sessionId,
  });

  this.eventEmitter.emit('user.login', {
    userId: user.id,
    tenantId,
    sessionId,
    ipHash: ip ? hashForStorage(ip) : null,
    userAgent,
    mfaUsed,
    at: new Date(),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 900,
  };
}

private truncateIp(ip: string): string {
  // IPv4: /24 — keep first 3 octets
  // IPv6: /48 — keep first 3 groups
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 3).join(':') + '::';
  }
  return ip.split('.').slice(0, 3).join('.') + '.0';
}

async refresh(oldRefreshToken: string, userAgent?: string, ip?: string) {
  const ipPrefix = ip ? this.truncateIp(ip) : undefined;
  return this.tokenService.rotateRefreshToken(oldRefreshToken, userAgent, ipPrefix);
}

async logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    const hash = hashForStorage(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
    });
    if (session) {
      await this.tokenService.revokeSession(userId, session.id, 'user');
    }
  }
}
```

- [ ] **Step 6: Add login/refresh/logout routes to AuthController**

Add to `AuthController`:

```ts
@Public()
@Post('login')
@HttpCode(HttpStatus.OK)
async login(
  @Body() dto: LoginDto,
  @Req() req: any,
) {
  const userAgent = req.headers['user-agent'];
  const ip = req.ip || req.connection?.remoteAddress;
  return this.authService.login(dto.email, dto.password, userAgent, ip);
}

@Public()
@Post('refresh')
@HttpCode(HttpStatus.OK)
async refresh(
  @Body() dto: RefreshDto,
  @Req() req: any,
) {
  const userAgent = req.headers['user-agent'];
  const ip = req.ip || req.connection?.remoteAddress;
  return this.authService.refresh(dto.refreshToken, userAgent, ip);
}

@Post('logout')
@HttpCode(HttpStatus.NO_CONTENT)
async logout(
  @Body() dto: RefreshDto,
  @Req() req: any,
) {
  // Get user from JWT (T4 will wire this properly)
  return this.authService.logout('', dto.refreshToken);
}
```

- [ ] **Step 7: Update AuthModule with JwtModule + Passport**

Update `apps/api/src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaClient } from '@prisma/client';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // configured per-sign via keyRing
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    JwtStrategy,
    PrismaClient,
  ],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
```

- [ ] **Step 8: Update TenantContextGuard with real JWT validation**

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../services/token.service';
import { Request } from 'express';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);
    try {
      const decoded = this.tokenService.verifyAccessToken(token);
      (request as any).user = decoded;
      (request as any).tenantId = decoded.tid;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

- [ ] **Step 9: Run tests and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run test/auth/ && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T3 TokenService + login/refresh/logout"
```

---

### Task 4: Guards + Decorators + Me + Switch-Tenant

**Files:**

- Create: `apps/api/src/modules/auth/decorators/tenant-id.decorator.ts`
- Create: `apps/api/src/modules/auth/decorators/principal.decorator.ts`
- Create: `apps/api/src/modules/auth/decorators/roles.decorator.ts`
- Create: `apps/api/src/modules/auth/decorators/platform-role.decorator.ts`
- Create: `apps/api/src/modules/auth/dto/switch-tenant.dto.ts`
- Modify: `apps/api/src/modules/auth/guards/tenant-context.guard.ts` (add 404 rule)
- Modify: `apps/api/src/modules/auth/guards/roles.guard.ts` (real role enforcement)
- Delete: `apps/api/src/common/tenant-id.decorator.ts` (E00 placeholder)
- Delete: `apps/api/src/common/tenant-id.decorator.spec.ts`
- Modify: `apps/api/src/app.module.ts` (remove old import if any)
- Create: `apps/api/test/auth/guards.spec.ts`

- [ ] **Step 1: Create all auth decorators**

Create `apps/api/src/modules/auth/decorators/tenant-id.decorator.ts`:

```ts
import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.tenantId) {
      throw new InternalServerErrorException(
        'TenantId decorator used on route without tenant context',
      );
    }
    return request.tenantId;
  },
);
```

Create `apps/api/src/modules/auth/decorators/principal.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface Principal {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  platformRole?: string;
  sessionId: string;
}

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

Create `apps/api/src/modules/auth/decorators/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

Create `apps/api/src/modules/auth/decorators/platform-role.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROLE_KEY = 'platformRole';
export const PlatformRole = (role: string) =>
  SetMetadata(PLATFORM_ROLE_KEY, role);
```

- [ ] **Step 2: Create barrel export**

Create `apps/api/src/common/tenant/index.ts`:

```ts
export { TenantId } from '../../modules/auth/decorators/tenant-id.decorator';
export { Principal } from '../../modules/auth/decorators/principal.decorator';
export { Roles } from '../../modules/auth/decorators/roles.decorator';
export { Public } from '../../modules/auth/decorators/public.decorator';
export { PlatformRole } from '../../modules/auth/decorators/platform-role.decorator';
export { TenantContextGuard } from '../../modules/auth/guards/tenant-context.guard';
export { RolesGuard } from '../../modules/auth/guards/roles.guard';
```

- [ ] **Step 3: Update TenantContextGuard with 404 rule**

Update `apps/api/src/modules/auth/guards/tenant-context.guard.ts`:

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../services/token.service';
import { Request } from 'express';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    // Check for ApiClient bearer token first
    if (authHeader?.startsWith('Bearer vk_')) {
      // Defer to ApiClientService — handled by InternalOnly guard
      // If not @InternalOnly, bearer vk_ tokens are not valid here
      throw new UnauthorizedException();
    }

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);
    let decoded: any;
    try {
      decoded = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException();
    }

    (request as any).user = decoded;
    (request as any).tenantId = decoded.tid;

    // 404 rule: if route has :tenantId param and it doesn't match claims.tid
    // Exception: @PlatformRole routes where :tenantId is authoritative
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const routeTenantId = request.params?.tenantId;
    if (routeTenantId && routeTenantId !== decoded.tid) {
      if (platformRole) {
        // For platform role, route param is authoritative
        (request as any).tenantId = routeTenantId;
      } else {
        throw new NotFoundException();
      }
    }

    return true;
  }
}
```

- [ ] **Step 4: Update RolesGuard with real enforcement**

Update `apps/api/src/modules/auth/guards/roles.guard.ts`:

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';

const ROLE_HIERARCHY: Record<string, string[]> = {
  owner: ['owner', 'operator', 'viewer'],
  operator: ['operator', 'viewer'],
  viewer: ['viewer'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // Check platform role
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (platformRole) {
      return user.platformRole === platformRole;
    }

    // Check tenant role hierarchy
    const userRole = user.role;
    const allowedRoles = ROLE_HIERARCHY[userRole] ?? [userRole];
    const hasRole = requiredRoles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

- [ ] **Step 5: Write guard decision table tests**

Create `apps/api/test/auth/guards.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

function makeContext(user: any, metadata: Record<string, any>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: {} }),
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as any;
}

function makeReflector(metadata: Record<string, any>) {
  return {
    getAllAndOverride: (key: string, _targets: any[]) => metadata[key],
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('owner can access @Roles("owner") routes', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['owner'] }));
    const ctx = makeContext({ role: 'owner' }, {});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('owner can access @Roles("operator") routes (hierarchy)', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['operator'] }));
    const ctx = makeContext({ role: 'owner' }, {});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('owner can access @Roles("viewer") routes (hierarchy)', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['viewer'] }));
    const ctx = makeContext({ role: 'owner' }, {});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('viewer cannot access @Roles("owner") routes', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['owner'] }));
    const ctx = makeContext({ role: 'viewer' }, {});
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('viewer cannot access @Roles("operator") routes', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['operator'] }));
    const ctx = makeContext({ role: 'viewer' }, {});
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('operator can access @Roles("viewer") routes', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['viewer'] }));
    const ctx = makeContext({ role: 'operator' }, {});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('operator cannot access @Roles("owner") routes', () => {
    const guard = new RolesGuard(makeReflector({ roles: ['owner'] }));
    const ctx = makeContext({ role: 'operator' }, {});
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});
```

- [ ] **Step 6: Add GET /auth/me and POST /auth/switch-tenant**

Add to AuthService:

```ts
async me(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { tenant: true } },
    },
  });
  if (!user) throw new UnauthorizedException();

  const { passwordHash, mfaSecret, recoveryCodes, ...safe } = user;
  return {
    ...safe,
    mfaEnabled: user.mfaEnabled,
    memberships: user.memberships.map((m) => ({
      tenantId: m.tenantId,
      role: m.role,
      tenant: { id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug },
    })),
  };
}

async switchTenant(userId: string, tenantId: string, currentSessionId: string) {
  const membership = await this.prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!membership) {
    throw new NotFoundException('No membership for this tenant');
  }

  // Update session's active tenant
  await this.prisma.session.update({
    where: { id: currentSessionId },
    data: { tenantId },
  });

  const accessToken = await this.tokenService.issueAccessToken({
    userId,
    tenantId,
    role: membership.role,
    sessionId: currentSessionId,
  });

  // Also issue a new refresh token for the new context
  const newRefresh = this.tokenService.generateRefreshToken();
  const session = await this.prisma.session.findUnique({ where: { id: currentSessionId } });
  if (session) {
    const newHash = hashForStorage(newRefresh);
    await this.prisma.session.update({
      where: { id: currentSessionId },
      data: { refreshTokenHash: newHash, tenantId, lastSeenAt: new Date() },
    });
  }

  return { accessToken, refreshToken: newRefresh };
}
```

Add to AuthController:

```ts
@Get('me')
async me(@Req() req: any) {
  return this.authService.me(req.user.userId);
}

@Post('switch-tenant')
@HttpCode(HttpStatus.OK)
async switchTenant(
  @Body() dto: SwitchTenantDto,
  @Req() req: any,
) {
  return this.authService.switchTenant(
    req.user.userId,
    dto.tenantId,
    req.user.sessionId,
  );
}
```

- [ ] **Step 7: Delete E00 placeholder decorator**

Delete:

- `apps/api/src/common/tenant-id.decorator.ts`
- `apps/api/src/common/tenant-id.decorator.spec.ts`

- [ ] **Step 8: Run tests and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T4 guards, decorators, /auth/me, /auth/switch-tenant"
```

---

### Task 5: MembersModule

**Files:**

- Create: `apps/api/src/modules/members/members.module.ts`
- Create: `apps/api/src/modules/members/members.controller.ts`
- Create: `apps/api/src/modules/members/members.service.ts`
- Create: `apps/api/src/modules/members/dto/invite.dto.ts`
- Create: `apps/api/src/modules/members/dto/change-role.dto.ts`
- Modify: `apps/api/src/app.module.ts` (add MembersModule)
- Test: `apps/api/test/auth/members.integration.spec.ts`

- [ ] **Step 1: Create MembershipService**

Create `apps/api/src/modules/members/members.service.ts`:

```ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  EventEmitter2,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class MembershipService {
  constructor(
    private prisma: PrismaClient,
    private eventEmitter: EventEmitter2,
  ) {}

  async addOwner(userId: string, tenantId: string) {
    return this.prisma.membership.create({
      data: { userId, tenantId, role: 'owner' },
    });
  }

  async listForTenant(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async invite(
    tenantId: string,
    email: string,
    role: string,
    invitedBy: string,
  ) {
    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Create user with no password (will set via invitation link)
      user = await this.prisma.user.create({
        data: { email, displayName: email.split('@')[0] },
      });
    }

    // Check if already a member
    const existing = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: role as any },
    });

    // Create password reset token for set-password flow
    const token = crypto.randomUUID();
    const tokenHash = hashForStorage(token);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days for invite
      },
    });

    // Send set-password email
    // TODO(T7): Wire to MAILER — for now just emit event

    this.eventEmitter.emit('member.invited', {
      tenantId,
      userId: user.id,
      role,
      invitedBy,
      at: new Date(),
    });

    return membership;
  }

  async setRole(
    tenantId: string,
    userId: string,
    newRole: string,
    changedBy: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Last owner protection
    if (membership.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({ error: 'last_owner' });
      }
    }

    const oldRole = membership.role;
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: newRole as any },
    });

    this.eventEmitter.emit('member.role.changed', {
      tenantId,
      userId,
      from: oldRole,
      to: newRole,
      changedBy,
      at: new Date(),
    });

    return updated;
  }

  async remove(tenantId: string, userId: string, removedBy: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Last owner protection
    if (membership.role === 'owner') {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({ error: 'last_owner' });
      }
    }

    await this.prisma.membership.delete({
      where: { id: membership.id },
    });

    this.eventEmitter.emit('member.removed', {
      tenantId,
      userId,
      removedBy,
      at: new Date(),
    });
  }
}
```

- [ ] **Step 2: Create MembersController**

Create `apps/api/src/modules/members/members.controller.ts`:

```ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipService } from './members.service';
import { InviteDto } from './dto/invite.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Principal } from '../auth/decorators/principal.decorator';

@Controller('tenants/:tenantId/members')
export class MembersController {
  constructor(private membersService: MembershipService) {}

  @Get()
  @Roles('viewer')
  async list(@TenantId() tenantId: string) {
    return this.membersService.listForTenant(tenantId);
  }

  @Post('invite')
  @Roles('owner')
  async invite(
    @TenantId() tenantId: string,
    @Principal() principal: any,
    @Body() dto: InviteDto,
  ) {
    return this.membersService.invite(
      tenantId,
      dto.email,
      dto.role,
      principal.userId,
    );
  }

  @Patch(':userId')
  @Roles('owner')
  async changeRole(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Principal() principal: any,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.membersService.setRole(
      tenantId,
      userId,
      dto.role,
      principal.userId,
    );
  }

  @Delete(':userId')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Principal() principal: any,
  ) {
    return this.membersService.remove(tenantId, userId, principal.userId);
  }
}
```

- [ ] **Step 3: Create DTOs**

Create `apps/api/src/modules/members/dto/invite.dto.ts`:

```ts
import { IsEmail, IsIn } from 'class-validator';

export class InviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['owner', 'operator', 'viewer'])
  role!: string;
}
```

Create `apps/api/src/modules/members/dto/change-role.dto.ts`:

```ts
import { IsIn } from 'class-validator';

export class ChangeRoleDto {
  @IsIn(['owner', 'operator', 'viewer'])
  role!: string;
}
```

- [ ] **Step 4: Create MembersModule**

Create `apps/api/src/modules/members/members.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembershipService } from './members.service';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [MembersController],
  providers: [MembershipService, PrismaClient],
  exports: [MembershipService],
})
export class MembersModule {}
```

- [ ] **Step 5: Register MembersModule in AppModule**

Add `MembersModule` import to `app.module.ts`.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T5 MembersModule — list/invite/change-role/remove"
```

---

### Task 6: MfaService + MFA Routes

**Files:**

- Create: `apps/api/src/modules/auth/services/mfa.service.ts`
- Create: `apps/api/src/modules/auth/dto/mfa-challenge.dto.ts`
- Create: `apps/api/src/modules/auth/dto/mfa-enable.dto.ts`
- Create: `apps/api/src/modules/auth/dto/mfa-disable.dto.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (MFA in login flow)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (MFA routes)
- Test: `apps/api/test/auth/mfa.service.spec.ts`

- [ ] **Step 1: Write MfaService unit test**

Create `apps/api/test/auth/mfa.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MfaService } from '../../../src/modules/auth/services/mfa.service';

describe('MfaService', () => {
  let service: MfaService;

  beforeEach(() => {
    service = new MfaService('aabbccdd11223344aabbccdd11223344'); // test MFA_ENC_KEY
  });

  it('generates a secret and builds otpauth URI', () => {
    const result = service.generateSecret('user@test.io');
    expect(result.secret).toBeDefined();
    expect(result.otpauthUri).toContain('otpauth://totp/');
    expect(result.otpauthUri).toContain('user%40test.io');
  });

  it('verifies a valid TOTP code (±1 step window)', () => {
    const { secret, encrypted } = service.generateSecret('user@test.io');
    const authenticator = require('otplib/authenticator');
    authenticator.options = { step: 30 };
    const code = authenticator.generate(secret);
    expect(service.verifyTotp(code, encrypted)).toBe(true);
  });

  it('generates 10 recovery codes', () => {
    const codes = service.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(codes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('consumes a recovery code (single use)', async () => {
    const codes = service.generateRecoveryCodes();
    const code = codes[0];
    // Hash the codes for storage
    const hashedCodes = await service.hashRecoveryCodes(codes);
    const result = await service.consumeRecoveryCode(code, hashedCodes);
    expect(result.valid).toBe(true);
    // Second use fails
    const result2 = await service.consumeRecoveryCode(code, result.remaining);
    expect(result2.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Implement MfaService**

Create `apps/api/src/modules/auth/services/mfa.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import crypto from 'node:crypto';
import qrcode from 'qrcode';
import { hashForStorage } from '@verifynng/core';
import * as argon2 from 'argon2';

@Injectable()
export class MfaService {
  private readonly encKey: Buffer;

  constructor(encKeyHex: string) {
    this.encKey = Buffer.from(encKeyHex, 'hex');
  }

  generateSecret(email: string): {
    secret: string;
    otpauthUri: string;
    encrypted: string;
    qrDataUrl: Promise<string>;
  } {
    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(email, 'VerifyNG', secret);
    const encrypted = this.encrypt(secret);
    const qrDataUrl = qrcode.toDataURL(otpauthUri);
    return { secret, otpauthUri, encrypted, qrDataUrl };
  }

  verifyTotp(code: string, encryptedSecret: string): boolean {
    const secret = this.decrypt(encryptedSecret);
    return authenticator.verify({ token: code, secret });
  }

  generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const bytes = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${bytes.slice(0, 4)}-${bytes.slice(4)}`);
    }
    return codes;
  }

  async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(
      codes.map((c) => argon2.hash(c, { type: argon2.argon2id })),
    );
  }

  async consumeRecoveryCode(
    code: string,
    hashedCodes: string[],
  ): Promise<{ valid: boolean; remaining: string[] }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await argon2.verify(hashedCodes[i], code);
      if (match) {
        const remaining = [...hashedCodes];
        remaining.splice(i, 1);
        return { valid: true, remaining };
      }
    }
    return { valid: false, remaining: hashedCodes };
  }

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

- [ ] **Step 3: Add MFA routes to AuthController/AuthService**

Add MFA setup/enable/disable/challenge methods to AuthService and corresponding controller routes.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T6 MfaService + TOTP MFA routes"
```

---

### Task 7: Password Reset/Change + SmtpMailer

**Files:**

- Create: `apps/api/src/modules/auth/mailer/mailer.interface.ts`
- Create: `apps/api/src/modules/auth/mailer/smtp-mailer.service.ts`
- Create: `apps/api/src/modules/auth/dto/forgot-password.dto.ts`
- Create: `apps/api/src/modules/auth/dto/reset-password.dto.ts`
- Create: `apps/api/src/modules/auth/dto/change-password.dto.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

- [ ] **Step 1: Create Mailer interface and SmtpMailer**

Create `apps/api/src/modules/auth/mailer/mailer.interface.ts`:

```ts
export interface MailMessage {
  to: string;
  template:
    | 'password-reset'
    | 'mfa-enabled'
    | 'new-device-login'
    | 'set-password';
  vars: Record<string, string>;
}

export const MAILER = Symbol('MAILER');

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}
```

Create `apps/api/src/modules/auth/mailer/smtp-mailer.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Mailer, MailMessage } from './mailer.interface';
import nodemailer from 'nodemailer';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class SmtpMailer implements Mailer {
  private transporter: nodemailer.Transporter;

  constructor() {
    const env = loadEnv();
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }

  async send(msg: MailMessage): Promise<void> {
    const env = loadEnv();
    const baseUrl = env.APP_BASE_URL ?? 'http://localhost:3001';

    let subject: string;
    let html: string;

    switch (msg.template) {
      case 'password-reset':
        subject = 'Reset your password';
        html = `<p>Click <a href="${baseUrl}/auth/reset-password?token=${msg.vars.token}">here</a> to reset your password.</p>`;
        break;
      case 'set-password':
        subject = 'Set your password';
        html = `<p>You've been invited. <a href="${baseUrl}/auth/set-password?token=${msg.vars.token}">Set your password</a>.</p>`;
        break;
      case 'mfa-enabled':
        subject = 'MFA enabled on your account';
        html =
          '<p>Two-factor authentication has been enabled on your account.</p>';
        break;
      case 'new-device-login':
        subject = 'New device login';
        html = `<p>A new login was detected from ${msg.vars.device ?? 'an unknown device'}.</p>`;
        break;
    }

    await this.transporter.sendMail({
      from: '"VerifyNG" <noreply@verifyng.local>',
      to: msg.to,
      subject,
      html,
    });
  }
}
```

- [ ] **Step 2: Add password reset/change to AuthService**

Add methods for forgot, reset, change password. All use the PasswordResetToken model and MAILER.

- [ ] **Step 3: Add routes to AuthController**

```ts
@Public()
@Post('password/forgot')
@HttpCode(HttpStatus.ACCEPTED)
async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
  await this.authService.forgotPassword(dto.email);
  return; // Always 202 — no user enumeration
}

@Public()
@Post('password/reset')
@HttpCode(HttpStatus.NO_CONTENT)
async resetPassword(@Body() dto: ResetPasswordDto) {
  await this.authService.resetPassword(dto.token, dto.newPassword);
}

@Post('password/change')
@HttpCode(HttpStatus.NO_CONTENT)
async changePassword(
  @Body() dto: ChangePasswordDto,
  @Principal() principal: any,
) {
  await this.authService.changePassword(
    principal.userId, dto.currentPassword, dto.newPassword,
  );
}
```

- [ ] **Step 4: Run tests and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

```bash
git add -A
git commit -m "feat(E02): T7 password reset/change + SmtpMailer"
```

---

### Task 8: Sessions API

**Files:**

- Modify: `apps/api/src/modules/auth/auth.service.ts` (session list/revoke methods)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (session routes)

- [ ] **Step 1: Add session methods to AuthService**

```ts
async listSessions(userId: string, currentSessionId: string) {
  const sessions = await this.prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ipPrefix: s.ipPrefix,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    current: s.id === currentSessionId,
  }));
}

async revokeSession(userId: string, sessionId: string, currentSessionId: string) {
  await this.tokenService.revokeSession(userId, sessionId, 'user');
}

async revokeAllOtherSessions(userId: string, currentSessionId: string) {
  await this.tokenService.revokeAllSessions(userId, currentSessionId, 'user');
}
```

- [ ] **Step 2: Add routes to AuthController**

```ts
@Get('sessions')
async listSessions(@Principal() principal: any) {
  return this.authService.listSessions(principal.userId, principal.sessionId);
}

@Delete('sessions/:sessionId')
@HttpCode(HttpStatus.NO_CONTENT)
async revokeSession(
  @Param('sessionId') sessionId: string,
  @Principal() principal: any,
) {
  await this.authService.revokeSession(principal.userId, sessionId, principal.sessionId);
}

@Delete('sessions')
@HttpCode(HttpStatus.NO_CONTENT)
async revokeAllOtherSessions(@Principal() principal: any) {
  await this.authService.revokeAllOtherSessions(principal.userId, principal.sessionId);
}
```

- [ ] **Step 3: Run tests and commit**

```bash
git add -A
git commit -m "feat(E02): T8 Sessions API — list/revoke"
```

---

### Task 9: ApiClientService + @InternalOnly

**Files:**

- Create: `apps/api/src/modules/auth/services/api-client.service.ts`
- Create: `apps/api/src/modules/auth/guards/internal-only.guard.ts`
- Create: `apps/api/src/modules/auth/decorators/internal-only.decorator.ts`
- Create: `apps/api/src/modules/auth/strategies/api-client.strategy.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Modify: `apps/api/src/modules/auth/guards/tenant-context.guard.ts` (recognize vk\_ tokens)

- [ ] **Step 1: Implement ApiClientService**

Create `apps/api/src/modules/auth/services/api-client.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashForStorage } from '@verifynng/core';
import crypto from 'node:crypto';

@Injectable()
export class ApiClientService {
  constructor(private prisma: PrismaClient) {}

  async create(name: string, tenantId?: string, scopes: string[] = []) {
    const rawKey = `vk_${crypto.randomBytes(4).toString('hex')}_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashForStorage(rawKey);
    const keyPrefix = rawKey.slice(0, 8);

    const client = await this.prisma.apiClient.create({
      data: { tenantId, name, keyHash, keyPrefix, scopes },
    });

    return { id: client.id, rawKey }; // rawKey shown once
  }

  async verify(rawKey: string) {
    const keyHash = hashForStorage(rawKey);
    const client = await this.prisma.apiClient.findUnique({
      where: { keyHash },
    });
    if (!client || client.revokedAt) {
      throw new UnauthorizedException();
    }

    // Update lastUsedAt
    await this.prisma.apiClient.update({
      where: { id: client.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      apiClientId: client.id,
      tenantId: client.tenantId,
      scopes: client.scopes,
    };
  }

  async revoke(id: string) {
    await this.prisma.apiClient.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async seedInternalClients(internalApiKeys: string) {
    // Format: "name:key,name:key"
    const entries = internalApiKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [name, key] = entry.split(':');
      if (!name || !key) continue;
      const keyHash = hashForStorage(`vk_${key.slice(0, 8)}_${key.slice(8)}`);
      const keyPrefix = `vk_${key.slice(0, 8)}`;
      try {
        await this.prisma.apiClient.upsert({
          where: { keyHash },
          update: {},
          create: { name, keyHash, keyPrefix, scopes: ['internal'] },
        });
      } catch {
        // Idempotent — skip if already exists
      }
    }
  }
}
```

- [ ] **Step 2: Create @InternalOnly decorator**

Create `apps/api/src/modules/auth/decorators/internal-only.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const INTERNAL_ONLY_KEY = 'internalOnly';
export const InternalOnly = (scope?: string) =>
  SetMetadata(INTERNAL_ONLY_KEY, scope ?? true);
```

- [ ] **Step 3: Create InternalOnlyGuard**

Create `apps/api/src/modules/auth/guards/internal-only.guard.ts`:

```ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
export class InternalOnlyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiClientService: ApiClientService,
  ) {}

  async canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride(INTERNAL_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScope === undefined) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer vk_')) {
      throw new UnauthorizedException();
    }

    const rawKey = authHeader.slice(7);
    try {
      const client = await this.apiClientService.verify(rawKey);
      (request as any).apiClient = client;
      (request as any).user = {
        apiClientId: client.apiClientId,
        tenantId: client.tenantId,
        scopes: client.scopes,
      };

      // If scope is specified, check it
      if (
        typeof requiredScope === 'string' &&
        !client.scopes.includes(requiredScope)
      ) {
        throw new UnauthorizedException();
      }

      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

- [ ] **Step 4: Add internal routes (whoami, api-clients CRUD)**

Add an internal controller with:

- `GET /internal/whoami` — `@InternalOnly()`
- `POST /internal/api-clients` — `@PlatformRole('support')`
- `DELETE /internal/api-clients/:id` — `@PlatformRole('support')`

- [ ] **Step 5: Wire seedInternalClients on module init**

Call `seedInternalClients(INTERNAL_API_KEYS)` in `AuthModule.onModuleInit`.

- [ ] **Step 6: Run tests and commit**

```bash
git add -A
git commit -m "feat(E02): T9 ApiClientService + @InternalOnly + /internal routes"
```

---

### Task 10: @PlatformRole('support') + support seed user

**Files:**

- Modify: `apps/api/src/modules/auth/auth.module.ts` (support routes)
- Modify: `packages/db/prisma/seed.ts` (add support user)
- Create: `apps/api/src/modules/auth/controllers/internal.controller.ts`

- [ ] **Step 1: Create InternalController with @PlatformRole('support')**

Create `apps/api/src/modules/auth/controllers/internal.controller.ts` with api-clients CRUD routes and whoami, protected by `@PlatformRole('support')` and `@InternalOnly()`.

- [ ] **Step 2: Add support.tenant.accessed event emission**

When a `@PlatformRole('support')` user accesses a tenant-scoped route, emit the event in `TenantContextGuard`.

- [ ] **Step 3: Update seed with support user**

Add to `packages/db/prisma/seed.ts`:

```ts
// E02: support user
const supportUser = await prisma.user.upsert({
  where: { email: 'support@verifyng.local' },
  update: {},
  create: {
    email: 'support@verifyng.local',
    passwordHash: await hashPassword('Passw0rd!Passw0rd!'),
    displayName: 'Support',
    platformRole: 'support',
  },
});
```

Also add `owner@ivoryglow.local`, `operator@ivoryglow.local`, `viewer@ivoryglow.local` as members of ivoryglow.

- [ ] **Step 4: Run tests and commit**

```bash
git add -A
git commit -m "feat(E02): T10 @PlatformRole(support) + support seed user"
```

---

### Task 11: Isolation Harness

**Files:**

- Create: `packages/db/src/testing/tenant-isolation.ts`
- Create: `apps/api/test/isolation/E02.isolation.spec.ts`
- Modify: `packages/db/src/index.ts` (re-export)
- Modify: `packages/db/src/testing/index.ts` (re-export)

- [ ] **Step 1: Create tenant-isolation.ts in packages/db/src/testing**

```ts
import type { PrismaClient, Tenant, User } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';

export interface UserFixture {
  user: User;
  accessToken: string;
}

export interface TenantFixture {
  tenant: Tenant;
  owner: UserFixture;
  operator: UserFixture;
  viewer: UserFixture;
}

export async function createTwoTenants(prisma: PrismaClient): Promise<{
  a: TenantFixture;
  b: TenantFixture;
}> {
  // Create tenants, users, memberships
  // Return fixtures with access tokens for each role
  // Implementation uses the auth module's register/login endpoints
}

export interface IsolationRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: (ctx: TenantFixture) => string;
  body?: Record<string, any>;
  expectWhenCrossTenant: 404 | 403;
}

export async function assertTenantIsolation(
  app: INestApplication,
  routes: IsolationRoute[],
): Promise<void> {
  // For each route:
  // 1. Call as tenant A's owner against tenant B's resources
  // 2. Must get the expected status
  // 3. Must not change any row in tenant B (row-count + updatedAt snapshot)
}
```

- [ ] **Step 2: Create E02.isolation.spec.ts**

Cover members routes cross-tenant isolation.

- [ ] **Step 3: Run tests and commit**

```bash
git add -A
git commit -m "feat(E02): T11 isolation harness + E02 isolation spec"
```

---

### Task 12: HTTP Collection + Docs + Seed

**Files:**

- Create: `apps/api/http/auth.http`
- Create: `docs/auth.md`
- Modify: `packages/db/prisma/seed.ts` (complete seed with all users)

- [ ] **Step 1: Create auth.http request collection**

Complete REST Client / httpyac collection covering all auth routes with the acceptance criteria flows.

- [ ] **Step 2: Create docs/auth.md**

Document:

- Token lifetimes (access 15m, refresh 30d)
- Rotation and reuse detection
- 404 rule for tenant mismatch
- How to add a protected route
- How to run a job with an ApiClient

- [ ] **Step 3: Finalize seed**

Complete seed with:

- `owner@ivoryglow.local` / `Passw0rd!Passw0rd!` (role: owner)
- `operator@ivoryglow.local` / `Passw0rd!Passw0rd!` (role: operator)
- `viewer@ivoryglow.local` / `Passw0rd!Passw0rd!` (role: viewer)
- `support@verifyng.local` / `Passw0rd!Passw0rd!` (platformRole: support)
- All with Membership rows for ivoryglow

- [ ] **Step 4: Run full pre-push checks**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(E02): T12 HTTP collection + docs + seed"
```

---

## Post-implementation: Acceptance Criteria Verification

After all tasks are done, verify each AC against `docker compose up` using the worktree ports (API=4206, Mailpit=8231, Postgres=5638):

- **AC1:** Register → login → protected call with 900s JWT
- **AC2:** Refresh rotation + reuse detection → 401 + `reuse-detected` in DB
- **AC3:** MFA setup → enable → login returns mfaRequired → challenge with TOTP/recovery
- **AC4:** Password forgot → 202 → Mailpit → reset → old token 401
- **AC5:** Server-derived tenant context, header ignored, 404 for cross-tenant
- **AC6:** Last owner → 409, invite sends mail
- **AC7:** Service auth with WORKER_KEY, made-up key → 401
- **AC8:** Isolation harness passes, fails when route reads tenantId from query
- **AC9:** Support user can cross-tenant → 200 + event logged

Paste evidence in GitHub issue #3 for each AC.
