# fake-oidc

`ghcr.io/navikt/mock-oauth2-server:2.1.10`, configured by `config.json`
(`JSON_CONFIG_PATH`). Issuer `default`, reachable in compose at
`http://fake-oidc:4104/default` (server-side, `FAKE_OIDC_ISSUER`) and on the
host at `http://localhost:${FAKE_OIDC_PORT:-4104}/default`
(browser-side, `FAKE_OIDC_PUBLIC_ISSUER`).

The server derives every URL in its discovery document (`issuer`,
`authorization_endpoint`, ...) from the `Host` header of whichever request
reached it — there is no single fixed issuer baked into the config. E20's
`OidcClientFactory` always discovers via `FAKE_OIDC_ISSUER`, so server-side
discovery, JWKS, and token-endpoint calls are internally consistent; the one
URL that needs rewriting from `FAKE_OIDC_ISSUER` to `FAKE_OIDC_PUBLIC_ISSUER`
is the `authorization_endpoint` handed to the browser for the redirect (the
browser can't resolve the `fake-oidc` compose hostname).

## Seeded users

`GET /default/authorize?...` shows `login.html` (`interactiveLogin: true` +
`loginPagePath`), one button per seeded user — no password. Each button is a
plain `<form method="post">` with hidden `username` and `claims` (a JSON
string) fields; `LoginRequestHandler` reads both directly off the POST body
and merges `claims` into the issued ID token verbatim.

(`tokenCallbacks`/`requestMappings` — the mechanism the mock server's own
`config.json` example uses — matches parameters sent to the **token**
endpoint, e.g. `scope` or `code`; it has no visibility into what was typed on
the interactive login page, so it can't key claims off a chosen username. The
`username`+`claims` login-page POST is the actual, empirically-verified
mechanism for this — confirmed by decoding the resulting ID token.)

| username                 | claims                                                      | role in seed data            |
| ------------------------ | ----------------------------------------------------------- | ---------------------------- |
| `owner@ivoryglow.com`    | `email_verified: true`, `hd: ivoryglow.com`, `amr: ["mfa"]` | ivoryglow owner (SSO-linked) |
| `ops@ivoryglow.com`      | `email_verified: true`, `hd: ivoryglow.com`                 | ivoryglow operator           |
| `newhire@ivoryglow.com`  | `email_verified: true`, `hd: ivoryglow.com`                 | not yet a member — JIT       |
| `newhire2@ivoryglow.com` | `email_verified: true`, `hd: ivoryglow.com`                 | JIT, used to test JIT-off    |
| `outsider@gmail.com`     | `email_verified: true`, `hd: gmail.com`                     | domain not allowed           |

To seed another user, add a `<form>` block to `login.html` and restart
`fake-oidc` (`docker compose restart fake-oidc`) — no code change.

## Claim differences vs. real providers

| Claim              | fake-oidc                           | Google                                                                     | Microsoft Entra ID                                                                                                                              |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub`              | static string per user (`fake-...`) | stable per Google account                                                  | stable per Entra object                                                                                                                         |
| `email_verified`   | always present, set explicitly      | always present                                                             | **not present by default** — must add `email` as an optional claim in the app registration, or fall back to `xms_edov`                          |
| domain claim       | `hd` (matches Google's field name)  | `hd` — only present for Google Workspace accounts, absent for `@gmail.com` | `tid` (directory/tenant id, not a domain string) — `AccountLinker` treats a configured Entra `issuer`'s tenant id as the domain check for Entra |
| `amr` / MFA signal | `amr: ["mfa"]` when set on a user   | not asserted by Google for consumer 2FA                                    | `acr`/`amr` populated only if Conditional Access enforced MFA — see `docs/sso-setup-guide.md`                                                   |
| issuer stability   | derived from request `Host` header  | fixed: `https://accounts.google.com`                                       | fixed per tenant: `https://login.microsoftonline.com/<tenant-id>/v2.0`                                                                          |

`AccountLinker` (T4) treats a `hd`/`tid` present-but-mismatched-with-
`allowedDomains` the same way regardless of provider; only the _source_ claim
name differs, handled in the provider-specific claim-mapping step.
