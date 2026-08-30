# Subprocessors

This is the internal reference; the public-facing version is served at `/legal/subprocessors` (via `GET /v1/legal/subprocessors`), sourced from `content/legal/subprocessors/en.md`. Keep both in sync when a subprocessor is added, removed, or its purpose changes.

| Subprocessor     | Purpose                      | Data                                          | Region                                 | DPA status  |
| ---------------- | ---------------------------- | --------------------------------------------- | -------------------------------------- | ----------- |
| Resend           | Transactional email delivery | Recipient email address, message content      | US/EU                                  | Not started |
| Termii           | SMS delivery                 | Recipient phone number, message content       | Nigeria                                | Not started |
| Paystack         | Payment processing           | Billing contact details, transaction metadata | Nigeria                                | Not started |
| MaxMind          | IP geolocation (approximate) | Hashed IP address                             | Global (processed, not retained by us) | Not started |
| Hosting provider | Application hosting          | All platform data                             | Placeholder — not yet finalised        | Not started |

DPA status is tracked here and in `docs/compliance/data-map.md`'s human checklist; update both when a DPA is signed.
