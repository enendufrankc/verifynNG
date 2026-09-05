# Setting up single sign-on

This guide is for a tenant owner configuring SSO in **Settings → Security →
Single sign-on**. It covers Google and Microsoft Entra ID — the two
providers the console supports — plus what to do when something doesn't
work.

Before you start: SSO is available on the growth and enterprise plans.
Configuring it saves a client secret that VerifyNG encrypts at rest and
never displays again (only the last 4 characters, to confirm which one is
set).

## Google

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or use an existing one) for your organisation.
2. **APIs & Services → OAuth consent screen**: choose **Internal** if every
   sign-in should be a Google Workspace account in your organisation (this
   is almost always what you want — it also guarantees the `hd` claim, see
   below). Choose **External** only if some of your staff use personal
   Gmail accounts under your allowed domain, which is unusual.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   application type **Web application**.
4. **Authorised redirect URIs**: add exactly the URL shown in the console's
   SSO settings page (your API's `SSO_CALLBACK_URL`, e.g.
   `https://api.yourcompany.com/auth/sso/callback`). Google matches this
   URI exactly — trailing slashes and http vs https both matter.
5. Copy the **Client ID** and **Client secret** into the console. Leave
   **Issuer** blank — Google's issuer is fixed
   (`https://accounts.google.com`) and the console already knows it.
6. Save, then click **Test connection**. It should show the issuer and
   `authorization_endpoint` in green.

**The `hd` claim.** Google includes `hd` (hosted domain) in the ID token
only for a Google Workspace account, set to the Workspace's primary domain.
A personal `@gmail.com` account never has it. VerifyNG checks the signed-in
user's **email domain** against your **Allowed domains** list either way —
`hd` is not required, but if it's present it must match, so a Workspace
user whose email happens to be an alias on a different domain than their
Workspace's primary domain can be rejected even though the email itself
looks fine. If you see unexpected `domain_not_allowed` rejections for real
staff, check what domain their Workspace admin actually set as primary.

## Microsoft Entra ID

1. In the [Entra admin center](https://entra.microsoft.com/), go to
   **Identity → Applications → App registrations → New registration**.
2. **Supported account types**: choose **Single tenant** (accounts in your
   organisation's directory only) unless you specifically need to accept
   sign-ins from other Entra tenants — single-tenant is what the vast
   majority of customers want, and it's what the domain-matching logic
   below assumes.
3. **Redirect URI**: platform **Web**, value = your `SSO_CALLBACK_URL`
   (same as Google, above).
4. After creation, note the **Directory (tenant) ID** — this is your
   **Issuer** value in the console, but not the raw GUID: enter it as
   `https://login.microsoftonline.com/<tenant-id>/v2.0`.
5. **Certificates & secrets → New client secret** — copy the secret's
   _value_ (not its ID) immediately; Entra never shows it again. Copy the
   **Application (client) ID** too.
6. **API permissions**: ensure `openid`, `email`, and `profile` (delegated,
   Microsoft Graph) are present — they're added by default for a new
   registration.
7. **Token configuration → Add optional claim → ID → `email`**. Entra does
   not include `email` in the ID token unless you add it here, and without
   it VerifyNG can't identify or link the signing-in user at all.
8. **`email_verified` / `xms_edov`**: unlike Google, Entra's ID token often
   doesn't include a plain `email_verified` claim. If your tenant enforces
   verified domains, Entra instead exposes `xms_edov: true` — VerifyNG
   treats a domain-verified email the same as an explicit
   `email_verified: true`. If neither claim is present, sign-in is rejected
   with `email_unverified` — this is deliberate (email is the one-time link
   to an account, so it must be trustworthy) and the fix is enabling domain
   verification for the relevant users in Entra, not something VerifyNG can
   work around.
9. Paste the **Client ID**, **Client secret**, and the **Issuer** URL
   (step 4) into the console, save, and **Test connection**.

## What to put in the console

| Field                     | Google                                                                                | Microsoft Entra ID                                   |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Provider                  | Google                                                                                | Microsoft Entra ID                                   |
| Client ID                 | OAuth client ID                                                                       | Application (client) ID                              |
| Client secret             | OAuth client secret                                                                   | Client secret **value**                              |
| Issuer                    | _(leave blank)_                                                                       | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Allowed domains           | your Workspace domain(s)                                                              | your verified domain(s)                              |
| Just-in-time provisioning | on, if new hires should get console access automatically as viewers without an invite | same                                                 |

## Enforcing SSO (disabling password sign-in)

Before the **Enforce SSO** switch can be turned on, three things must
already be true:

1. **SSO has been tested successfully in the last 24 hours** — click
   **Test connection** again if it's been a while.
2. **You (the owner making the change) have signed in via SSO at least
   once.** Sign out, sign back in with **Continue with SSO**, then come
   back to this page.
3. **Every owner on the account has two-factor authentication enrolled**
   (Settings → Security → Password & sessions → Two-factor authentication).
   This is what makes break-glass access possible later — an owner without
   TOTP has no way to use it.

If any of these aren't true yet, the switch will show exactly which ones
are missing rather than a generic error.

### Owner emergency access (break-glass)

Once SSO is enforced, the normal email+password form on the login page is
replaced by the SSO button. If your identity provider is ever unreachable,
an owner can still get in at `/sso/break-glass?tenant=<your-slug>` with
their password **and** a current authenticator code. This issues a
one-hour session — long enough to fix the SSO configuration or investigate
the outage — and is rate-limited to 5 attempts per hour per IP address.
Every use is recorded in the audit log as `auth.break_glass`.

## Troubleshooting

| Error code shown         | What it means                                                                                                     | Fix                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sso_not_configured`     | No SSO config exists yet, or it's been disabled                                                                   | An owner needs to set it up in Settings → Security → Single sign-on                                                                 |
| `idp_unreachable`        | Discovery or the token exchange timed out or failed                                                               | Check the identity provider's status; if it's actually down, use owner emergency access                                             |
| `idp_error`              | The identity provider itself returned an error (e.g. the user cancelled)                                          | Try signing in again                                                                                                                |
| `email_unverified`       | The ID token didn't assert a verified email                                                                       | Google: rare, check the account type. Entra: add the `email` optional claim (see above) and ensure domain verification / `xms_edov` |
| `domain_not_allowed`     | The signed-in account's email domain isn't in **Allowed domains**                                                 | Add the domain, or confirm the user is using their work account, not a personal one                                                 |
| `jit_disabled`           | The domain is allowed, but **Just-in-time provisioning** is off, and no existing member has that email            | Turn on JIT, or invite the person as a member first                                                                                 |
| `mfa_enrolment_required` | The tenant's MFA policy now requires this role to have two-factor authentication, and the grace period has passed | Sign in with your password and enrol two-factor authentication (Settings → Security → Password & sessions)                          |
| `state_mismatch`         | The sign-in link was already used, or the browser session expired mid-flow                                        | Start over from the login page                                                                                                      |
| `invalid_redirect`       | An internal error — the return URL wasn't on an allowed origin                                                    | Contact support if this persists                                                                                                    |

## For E18: break-glass procedure (auth-lockout runbook input)

If a tenant reports being locked out of their own console because their
identity provider is down and enforce-SSO is on:

1. Confirm with the tenant that an **owner** (not an operator or viewer —
   break-glass only works for the owner role) has their password and a
   working authenticator app.
2. Direct them to `https://<web-admin-host>/sso/break-glass?tenant=<slug>`.
3. If they've lost their authenticator, a recovery code from their
   two-factor enrolment works in its place at the normal MFA challenge
   screen, but **not** for break-glass, which specifically requires a live
   TOTP code — recovering a lost authenticator has to happen through the
   normal password-login MFA challenge before enforce-SSO was turned on, or
   by an owner who still has authenticator access disabling enforce-SSO
   first.
4. Every break-glass attempt (success or failure) is in the tenant's audit
   log as `auth.break_glass`, and successful ones are rate-limited to 5 per
   hour per source IP — if a tenant reports being unable to get a code
   through, that's the likely cause; the retry window is one hour.
5. Once back in, the owner should fix or reconfigure the SSO provider (see
   the troubleshooting table above), then turn Enforce SSO back on once
   **Test connection** is green again.
