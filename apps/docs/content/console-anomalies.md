# Console guide: Anomalies

An anomaly is a scan pattern that looks like counterfeiting rather than
normal use — the same unit "first verified" twice, implausible geography
between scans, a burst of scans that looks like enumeration, or a code
scanned before its batch could plausibly have shipped.

Each anomaly shows the rule that fired, a score, and the underlying scan
evidence (never raw IPs or exact coordinates — see the platform's honest-limits
policy in [How codes work](/docs/codes)). From here you can acknowledge,
resolve, or dismiss an anomaly, and add a note for whoever looks at it next.

A rising count of anomalies for one product or one region is worth a
[support ticket](/console/help) even if each individual one looks minor —
patterns across anomalies are often more informative than any single one.
