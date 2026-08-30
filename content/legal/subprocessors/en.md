# Subprocessors

We use the following subprocessors to operate the platform. This list is reviewed whenever a subprocessor is added or removed.

| Subprocessor     | Purpose                      | Data                                          | Region                                                                                     |
| ---------------- | ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Resend           | Transactional email delivery | Recipient email address, message content      | US/EU                                                                                      |
| Termii           | SMS delivery                 | Recipient phone number, message content       | Nigeria                                                                                    |
| Paystack         | Payment processing           | Billing contact details, transaction metadata | Nigeria                                                                                    |
| MaxMind          | IP geolocation (approximate) | Hashed IP address                             | Global (processed, not retained by us)                                                     |
| Hosting provider | Application hosting          | All platform data                             | Placeholder — finalised before production launch, tracked in `docs/compliance/data-map.md` |

Full data-processing-agreement status for each subprocessor is tracked in `docs/compliance/data-map.md`.
