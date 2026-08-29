# Test Data Privacy Rules

## Principles

1. **No real PII** in any fixture, seed data, screenshot, or test artifact.
2. All emails under `.test`, `.local`, or `example.com` domains.
3. Names from a fixed synthetic list only.
4. IPs from TEST-NET-1 (192.0.2.0/24), TEST-NET-2 (198.51.100.0/24), TEST-NET-3 (203.0.113.0/24) and documented test ranges only.
5. No real phone numbers, addresses, or payment card numbers.
6. No real person, address, or financial instrument appears.

## Enforcement

`pnpm seed:lint` scans seed output and test fixtures for:

- Emails not under `.test`, `.local`, or `example.com`
- Nigerian phone number patterns
- PAN-like sequences (16+ digit numbers with Luhn validity)
- Real-world addresses

CI fails on any hit.

## Synthetic IP ranges per city

Used by the realistic seed and load tests:

| City          | IP range                   | Notes      |
| ------------- | -------------------------- | ---------- |
| Lagos         | 192.0.2.1–192.0.2.50       | TEST-NET-1 |
| Abuja         | 192.0.2.51–192.0.2.80      | TEST-NET-1 |
| Kano          | 192.0.2.81–192.0.2.100     | TEST-NET-1 |
| Port Harcourt | 192.0.2.101–192.0.2.130    | TEST-NET-1 |
| Ibadan        | 192.0.2.131–192.0.2.150    | TEST-NET-1 |
| Onitsha       | 192.0.2.151–192.0.2.170    | TEST-NET-1 |
| London        | 198.51.100.1–198.51.100.50 | TEST-NET-2 |
| Accra         | 203.0.113.1–203.0.113.30   | TEST-NET-3 |
| Nairobi       | 203.0.113.31–203.0.113.60  | TEST-NET-3 |

The `fake-geo` service maps these ranges to the corresponding city names.
