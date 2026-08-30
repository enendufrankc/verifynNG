# Service Level Objectives (SLO) — Verify Platform

## 1. Overview

This document specifies the Service Level Indicators (SLIs), Service Level Objectives (SLOs), and Error Budget Policies for the verifynNG product authentication platform.

The core promise of the platform is cryptographic product verification. Downtime or slow verification directly impacts consumer trust at the point of sale.

---

## 2. Service Level Indicators (SLIs)

### 2.1 Availability SLI

- **Definition:** Percentage of successful synthetic uptime probes and valid user verification requests over a rolling 30-day window.
- **Formula:** `SLI_availability = (successful_probes + 2xx/4xx_verify_requests) / total_attempts * 100`
- **Exclusions:** 503 responses caused by planned maintenance windows or pre-scheduled database migrations.

### 2.2 Latency SLI

- **Definition:** Server-side p95 latency of the verification endpoint (`GET /v1/verify/*`) measured over a 5-minute window.
- **Measurement:** OTel `verify_latency_ms` histogram.

---

## 3. Service Level Objectives (SLOs)

| Metric                   | Target   | Window          | Allowed Budget Outage |
| ------------------------ | -------- | --------------- | --------------------- |
| **Availability**         | 99.9%    | Rolling 30 Days | ~43.2 minutes         |
| **Verify Latency (p95)** | < 300 ms | 5-minute rate   | N/A                   |

---

## 4. Error Budget Policy

1. **100% – 50% Budget Remaining:** Normal feature development and deployments proceed.
2. **50% – 25% Budget Remaining:** Heightened monitoring; non-critical risk deploys require tech-lead approval.
3. **< 25% Budget Remaining (Error Budget Freeze):**
   - **Feature Freeze:** All non-verification deploy pipelines are frozen.
   - **Focus:** Engineering resources switch exclusively to reliability, performance, and bug fixes until the error budget recovers above 50%.

---

## 5. Alerting & Burn Rates

| Alert Name             | Condition                          | Severity | Action / Destination                                        |
| ---------------------- | ---------------------------------- | -------- | ----------------------------------------------------------- |
| `VerifyErrorRateHigh`  | 5xx error rate > 1% over 5m        | Page     | On-call engineer paged (Mailpit locally, PagerDuty in prod) |
| `VerifyLatencyP95High` | p95 latency > 500ms over 10m       | Ticket   | Ops ticket opened                                           |
| `ProbeFailing`         | 2 consecutive probe failures (60s) | Page     | On-call engineer paged                                      |
| `ReadinessFailing`     | API `/ready` != 200 for 1m         | Page     | On-call engineer paged                                      |

---

## 6. Local vs Production Measurement

- **Local (Compose):** Measured by `uptime-probe` container polling `api:4000`, `web-verify:3000`, `web-admin:3001` every 30s. Metrics scraped by Prometheus on host port `3103`.
- **Production:** Multi-region synthetic probes from external monitoring nodes targeting regional ingress endpoints.
