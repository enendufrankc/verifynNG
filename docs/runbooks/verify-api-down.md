# Runbook: Verify API Outage / Degraded

## 1. Trigger & Detection

This runbook is triggered by any of the following:

- Alert `ProbeFailing` or `ReadinessFailing` firing in Grafana / Mailpit.
- Public status page (`http://localhost:3000/status`) displaying **Degraded** or **Outage**.
- Consumer report spike or error rate > 1% on `/v1/verify/*`.

---

## 2. First 5 Minutes (Triage)

1. **Check `/ready` Endpoint:**

   ```bash
   curl -i http://localhost:4000/ready
   ```

   Inspect which check is failing (`db`, `migrations`, `redis`, `storage`, `workers`).

2. **Check Container Status:**

   ```bash
   docker compose -f docker/compose.yml ps
   ```

3. **Inspect API Logs for Exceptions:**

   ```bash
   docker compose -f docker/compose.yml logs api --tail 50 | jq .
   ```

4. **Check Grafana Dashboards:**
   Open Grafana (`http://localhost:3100`), view **Verify Path** and **Platform** dashboards for latency spikes or connection pool exhaustion.

---

## 3. Likely Causes and Remediations

### A. Database Unreachable / Pool Exhausted

- **Symptom:** `/ready` returns `{ "db": "down" }`.
- **Fix:** Restart Postgres or inspect active queries:
  ```bash
  docker compose -f docker/compose.yml restart postgres
  ```

### B. Redis Disconnected

- **Symptom:** `/ready` returns `{ "redis": "down" }`.
- **Fix:** Restart Redis container:
  ```bash
  docker compose -f docker/compose.yml restart redis
  ```

### C. Pending Unapplied Migrations

- **Symptom:** `/ready` returns `503` with `{ "migrations": "pending" }`.
- **Fix:** Run migration deploy:
  ```bash
  pnpm db:migrate
  ```

---

## 4. Rehearsal Script (Local Drill)

To simulate a database outage and verify alerting and recovery:

1. **Stop Postgres container:**
   ```bash
   docker compose -f docker/compose.yml stop postgres
   ```
2. **Verify `/ready` returns 503:**
   ```bash
   curl -i http://localhost:4000/ready
   ```
3. **Verify Alert:**
   Within 2 minutes, check Mailpit (`http://localhost:8025`) for `ProbeFailing` / `ReadinessFailing` notification email.
4. **Verify Status Page:**
   Open `http://localhost:3000/status` and verify overall status is **Outage**.
5. **Restore Postgres:**
   ```bash
   docker compose -f docker/compose.yml start postgres
   ```
6. **Verify Resolution:**
   `/ready` returns 200 `status: ready`, and resolved alert email arrives in Mailpit.

---

## 5. Post-Incident Review Template

- **Incident Title:**
- **Date / Duration:**
- **Impact Summary:**
- **Root Cause:**
- **Timeline of Events:**
- **Action Items to Prevent Recurrence:**
