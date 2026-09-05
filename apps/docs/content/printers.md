# Printer & label specs

These are the numbers to hand your label printer or packaging supplier.
They're standard QR/print-industry values, not platform-specific magic —
if your printer already has house specs that meet or exceed these, use
theirs.

## QR code

| Property         | Minimum                                             | Notes                                                                           |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Module size      | 0.4 mm                                              | Smaller modules blur on cheap phone cameras at arm's length.                    |
| Quiet zone       | 4 modules on every side                             | A tight quiet zone is the single most common cause of "won't scan" reports.     |
| Error correction | Level M (15%)                                       | Level Q (25%) for labels that will get scuffed (scratch-off panels, under-cap). |
| Contrast         | Dark code on light background, ≥ 70% contrast ratio | Avoid printing the code over a busy background image.                           |

## Print quality

| Property   | Minimum                                     | Notes                                                                                                |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resolution | 300 DPI                                     | Below this, module edges soften enough to cause misreads on worn labels.                             |
| Ink/toner  | Solid fill, no dithering on the code itself | Dithered/halftone fills inside the QR pattern are the second most common "won't scan" cause.         |
| Material   | Matte or semi-gloss                         | High-gloss laminate over a scratch-off panel can cause glare that blocks a scan under shop lighting. |

## Test-print checklist before a production run

1. Print 10–20 sample labels on the actual production printer and substrate
   (not a proof print on plain paper).
2. Scan every sample with at least two different phone models under normal
   indoor lighting — not a scanner app's "enhance contrast" mode.
3. For Tier 2 specifically: confirm the code is genuinely unreadable through
   the unopened scratch-off/cap/seal under both bright light and a phone
   flashlight (see [Applying labels](/docs/labels)).
4. Keep one unscanned sample of each batch on file — if a "code not found"
   pattern shows up later, it's the fastest way to tell a print defect from
   a real counterfeit.

## Getting help

If a batch fails scanning after it's already shipped, that's
[a support ticket]({{CONSOLE}}/help), not a print-spec question — platform
support can pull the batch's actual scan-failure pattern and tell you
whether it looks like a print defect or something else.
