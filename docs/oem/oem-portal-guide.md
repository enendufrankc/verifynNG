# OEM portal guide — what the factory does, step by step

This is the walkthrough for the OEM (manufacturer/printer) side of a
delivery. The tenant (brand) side is `docs/epics/E05-oem-manifest.md`'s
concern; this file is written for the person actually running the print job.

## 1. You get an email

When the brand delivers a batch to you, everyone at your company who has a
portal login gets an email ("Manifest delivered — `<sku>`") with a link like:

```
http://localhost:3001/oem/deliveries/<deliveryId>?token=<one-time-token>
```

That link is yours alone — anyone who has it but isn't logged in as your
company gets bounced; anyone logged in as your company but without the link
gets a page telling them to open it from the email instead. The link expires
(72 hours by default) and is only good for a handful of downloads (5 by
default) — if it stops working before you're done, ask the brand to resend it
(a new email, a fresh window) from their deliveries screen.

## 2. Log in and download

Log in at `http://localhost:3001/login` with the account the brand invited
(you'll have set a password via the invite email the first time). Following
the emailed link lands you on the delivery's detail page with **Download
manifest** and **Download QR artwork** available. The manifest is a signed
JSON file listing every unit in the batch (tier-1 and tier-2 codes, GS1
digital links) — hand it to whatever system drives your printer or laser
etcher. The QR artwork zip is the print-ready art from the brand's own
export.

## 3. Print, then prove it

Once the run is done, export whatever your line's scanner/verification
system recorded — a CSV with (at minimum) the tier-2 code for every unit
printed — and run:

```
pnpm oem:receipt <printed.csv> --out receipt.json
```

(See `docs/oem/receipt-cli.md` if you're running this outside the monorepo,
or your export uses a different column name.) This prints a summary and
writes `receipt.json`. Paste the contents of that file into the **Submit
print receipt** box on the delivery's portal page, or run the CLI with
`--submit` to send it straight through.

- **Match** → the batch moves to "printed," and you can record the shipment.
- **Mismatch** → the page shows what didn't match (wrong count, or a code
  from a different batch's watermark mixed into your CSV); the brand gets
  alerted too. Fix your export and resubmit — resubmitting the _same_ correct
  data twice is safe (nothing double-counts).

## 4. Ship it

Once a receipt has matched, the **Ship** form appears: carrier, tracking
reference, optional expected arrival date. Submitting it marks the batch
shipped — this can only happen once per batch; if you need to correct
shipment details afterward, contact the brand.

## Notes

- A factory that packs for two different brands gets two separate logins
  (one Membership + OEM-scope per brand) — this keeps each brand's tenant
  data completely separate, even though it's the same company.
- The portal never shows you another OEM's deliveries, and never shows you a
  brand's console pages — it's a different, narrower shell (no sidebar, no
  tenant navigation) reachable only with your OEM login.
- Nobody — not the brand, not the platform — can hand you the raw tier-2
  codes any other way. The signed manifest and this portal are the only path.
