# Design artefacts

| File | What |
|---|---|
| `design-system-brief.md` | The brief given to Claude Design. |
| `foundations/reference-brand-sheet.png` | Reference pasted into Claude Design: Mont type scale, cool neutrals (#FFFFFF → #040506), turquoise `#5AE9D7`/`#1CCFB8`, orange `#FF7958`, red `#FF5858`, green `#6CDA91`/`#2FBB5E`, button/input samples. |
| `foundations/foundations-v0.2-turquoise.dc.html` | **Direction A** — Claude Design canvas: tokens, type (Plus Jakarta Sans substituted for Mont), verdict family, usage rules. Derived from the reference. |
| `alternatives/foundations-v1-broadsheet.dc.html` | **Direction B** — alternative canvas on slate/paper with Space Grotesk + IBM Plex, built from the tool's "Broadsheet" pack. |
| `foundations/tokens-v0.2-turquoise.css` | The `:root` token block extracted from Direction A, for E11 to start from. |
| `foundations/claude-design-sync-note.md` | Claude Design's own note: it tried to read the repo for enums while it was empty. |

Open the `.dc.html` files in a browser, or re-import into Claude Design to continue editing. The original zip export is gitignored — keep the extracted files here instead.

## Status: Direction A is the design source of truth

`foundations-v0.2-turquoise.dc.html` + `tokens-v0.2-turquoise.css` are what `packages/ui` implements. Direction B is kept only as an alternative reference for the designer; UI epics must not take tokens from it. Any later change to the design lands here first (new canvas version + regenerated tokens file), then flows into `packages/ui` via an E11 PR.

**Consumers:** E11 (imports tokens, builds primitives), E09 (verdict screens, consumer components), E10 (product-page blocks), E18 (docs site theme), E04 (QR sheet print styles).

## Decisions Direction A already made (keep these regardless)

- **Turquoise is chrome only.** `#5AE9D7` on white is 1.5:1, so it carries dark ink; turquoise *text* is `#0E8F7F`. Turquoise is never a verdict colour.
- **Verdict signals are deepened for AA:** green `#2FBB5E → #14713A`, orange `#FF7958 → #A8461F`, red `#FF5858 → #B92B2B`. Each has a tint for bands.
- **One hue added:** violet `#6B3FA0` for "not recognised", chosen to separate from green/orange/red under common colour-blindness. Flagged as an addition to the brand palette.
- **Four channels per verdict:** notch signature, icon, band texture, plain-language label — colour is the fourth, never the only one.
- **Mont → Plus Jakarta Sans** (free, metrically close). If the Mont licence is available, swap back via the `--ff` token.

## Verdict enum reconciliation (design → E06 spec)

The canvas used provisional enum names. `E06-verification-scan-events.md` is the contract; the design labels map onto it as follows and the canvas should be updated at the next Claude Design sync.

| Design label | Design enum (provisional) | E06 `verdict` | Notes |
|---|---|---|---|
| Genuine | `genuine` | `ok` | tier 1 only |
| Authentic | `authentic_first` | `authentic` | tier 2, first verification |
| Checked before | `already_verified` | `already-verified` | hyphen, not underscore |
| Check this | `suspicious` | `suspicious` | |
| Flagged by the brand | `flagged` | `flagged` | |
| Withdrawn | `decommissioned` | `decommissioned` | |
| Not recognised | `unknown` | `unknown` | |
| Not a valid code | `invalid` | `invalid` | |
| Too many checks | `rate_limited` | `rate-limited` | |
| Could not check | `error` | — | client-side only (network/5xx); not a server verdict |

E06 also returns `severity` (green/neutral/amber/red/grey) and `reportable`; the design's band names should key off `severity`, and the report CTA off `reportable`, so the UI never re-derives tone from the verdict string.

## What's next

1. Re-open the Direction A canvas in Claude Design with the repo now populated so it can read `E06` and the E11 spec, fix the enum names, and proceed to the component inventory and key screens listed in `design-system-brief.md` §"Component inventory" and §"Key screens".
2. E11 imports the final tokens into `packages/ui` (Tailwind `@theme`) and treats this folder as the design source of truth.
