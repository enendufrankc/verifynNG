# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a suspected security vulnerability.

Email the repository owner (see the GitHub profile on the commit history /
`AGENTS.md`'s Git user) with:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof of concept if you have one.
- Any affected version/commit.

We aim to acknowledge a report within **3 business days** and to provide an
initial assessment (severity, expected fix timeline) within **10 business
days**. Coordinated disclosure is expected: please give us a reasonable
window to ship a fix before any public disclosure.

## Supported versions

There are no tagged releases yet — this is pre-launch, single-branch
(`main`) development. The only "supported version" is the current `main`.
Once the platform reaches a versioned release cadence, this section will
list which lines receive security fixes.

## Scope

In scope: this repository (`apps/`, `packages/`, `tools/`, `docker/`) and
its first-party infrastructure-as-code. Out of scope: the `legacy/`
milestone-1 prototype (reference-only, never deployed), and any
third-party service this platform integrates with (report those upstream).

## What we consider a vulnerability here

See `docs/security/threat-model.md` for the full STRIDE analysis. Headline
categories:

- Anything that lets a tier-2 code be forged, guessed, or read back in full
  after a scan.
- Anything that lets one tenant read or modify another tenant's data.
- Anything that lets an `AuditLog` row be edited or deleted after the fact
  (defeats the entire point of the audit trail).
- Secret/key material exposure (the core signing key, tenant credentials,
  session tokens).
- Standard OWASP-class issues: injection, broken auth, SSRF, etc.

## Dependency and secret scanning

`.github/workflows/security.yml` runs `pnpm audit`, gitleaks, and CodeQL on
every push/PR to `main` plus weekly. `.github/dependabot.yml` opens update
PRs on a similar cadence. See `docs/security/ci-gates.md` for how to triage
a failing gate.
