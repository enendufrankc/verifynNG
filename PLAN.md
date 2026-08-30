# E06 Implementation Plan

## Overview

E06 — Verification & Scan Events. The hot path: consumer scans a QR, gets a verdict within 150ms.
12 tasks, multiple dependencies. Build bottom-up.

## Dependency order

```
T1 (schema/migrations/env) ──► T6 (ScanEventsService) ──► T8 (VerifyController)
                    │                                        │
                    ├──► T4 (RateLimitModule) ──────────────►│
                    │                                        │
                    ├──► T5 (EnumerationDetector) ──────────►│
                    │                                        │
T2 (fake-geo) ──► T3 (GeoIpModule) ───────────────────────►│
                                                             │
T7 (VerdictEngine) ───────────────────────────────────────►│
                                                             │
T9 (OpenAPI) ◄─────────────────────────────────────────────┘
T10 (SMS) ◄────────────────────────────────────────────────┘
T11 (Load) ◄───────────────────────────────────────────────┘
T12 (Docs) ◄───────────────────────────────────────────────┘
```

## Phase 1: Foundation (T1, T2) — no upstream deps

- T1: Schema + migrations + env vars + Prisma extension
- T2: fake-geo deterministic server

## Phase 2: Core services (T3, T4, T5, T7) — depend on Phase 1

- T3: GeoIpModule (depends on T2)
- T4: RateLimitModule (depends on T1 for env vars + Redis)
- T5: EnumerationDetector (depends on T4 RateLimitService)
- T7: VerdictEngine (pure class, depends only on packages/core)

## Phase 3: Orchestration (T6, T8) — depend on Phase 2

- T6: ScanEventsService (depends on T1 schema, T3 geo, T7 verdict)
- T8: VerifyController (depends on T4, T5, T6, T7, T3)

## Phase 4: Integration (T9, T10) — depend on Phase 3

- T9: OpenAPI decorators + schema endpoint
- T10: SMS webhook module

## Phase 5: Validation (T11, T12) — depend on Phase 4

- T11: k6 load script + run
- T12: docs/verification.md

## Execution strategy

- Each phase gets its own commit(s) and can be a PR
- Pre-push checks must stay green at every commit
- Integration tests are written alongside the code, not after
- Use subagents for independent tasks within a phase where possible

## Risk areas

1. **Prisma extension for append-only**: needs careful testing at both extension and trigger levels
2. **Lua script for rate limiting**: needs real Redis; can't use ioredis-mock
3. **E02/E03/E04 not shipped**: E06 must stub behind published interfaces (SmsPort, @Public(), TenantBrandingService)
4. **Docker compose API service**: needs env vars for E06 injected in compose.yml
