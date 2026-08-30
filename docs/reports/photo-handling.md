# Photo handling

- Photos are never stored as uploaded. Every photo is re-encoded (JPEG quality 85, max 2000px longest side) via `sharp`, which strips all EXIF/GPS metadata by never calling `.withMetadata()` (sharp strips metadata by default on any transform — calling `withMetadata(false)` is a known sharp API trap that actually KEEPS metadata, so the code deliberately omits the call entirely) and neutralises polyglot files.
- HEIC/HEIF uploads are converted to JPEG first via `heic-convert` (the prebuilt `sharp` binary has no HEIF decoder), then run through the same resize/strip/encode pipeline.
- Magic bytes are sniffed with `file-type` before processing; a mismatch (e.g. a renamed PDF) is rejected as `magic_mismatch` and never reaches `sharp`.
- Decoded pixel count is capped (`REPORT_MAX_INPUT_PIXELS`, default 40 million) to guard against decompression-bomb uploads — a small, high-compression-ratio file with an enormous declared width/height.
- Incoming uploads land in the `reports-incoming` bucket with a 24h lifecycle policy set at API boot; the original is deleted from that bucket the moment processing succeeds (or expires there automatically if a report is never submitted).
- Retention: `ReportsRetention.purgeContact(before)` nulls `contactEmail`/`contactPhone` and sets `contactPurgedAt` for reports older than the tenant's retention window — the photos and all other report fields are untouched. E19 owns the retention _policy_ (when to call this); E08 owns the mechanism.
