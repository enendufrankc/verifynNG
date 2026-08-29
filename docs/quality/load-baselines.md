# Load Test Baselines

Results are recorded here each time the nightly load job runs. The reference machine spec is documented per entry.

## Baseline format

| Date | Commit | Script | Scale | RPS | p50 | p95 | p99 | Error rate | Machine |
| ---- | ------ | ------ | ----- | --- | --- | --- | --- | ---------- | ------- |
| —    | —      | —      | —     | —   | —   | —   | —   | —          | —       |

## Thresholds

| Script         | Threshold                                   |
| -------------- | ------------------------------------------- |
| verify.js      | p95 < 300ms, errors < 0.1%                  |
| mint.js        | 100k units < 10 min, zero 5xx               |
| public-api.js  | 429s are exactly the excess                 |
| enumeration.js | E06 blocks within 30s, legit p95 unaffected |

## Notes

- Baselines are for compose-on-a-laptop, not production SLOs.
- Production SLOs are E17's responsibility.
- A threshold breach in nightly fails the job and requires investigation.
