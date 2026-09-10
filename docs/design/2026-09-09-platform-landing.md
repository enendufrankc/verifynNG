# Verify platform landing page

Approved by the owner on 2026-09-09, with product-owner positioning clarified during implementation. E09 follow-up; the original epic remains done.

## Audience and conversion

Product owners are the major paying customers. The homepage leads with “Build trust into every product.” Primary action: Protect your brand (existing admin /signup). Secondary action: Verify a product (/verify). Sign in links to the existing admin /login. Explain what businesses create and manage: secure public QR codes, hidden unit codes, QR labels, signed manufacturer manifests, product information and scan insights. No new services, accounts, backend flows or verification logic.

## Composition

Header: Verify wordmark, How it works, For brands, Sign in. Desktop hero: oversized type beside a packaging/phone illustration. The example result is explicitly labelled; it contains no actual product code, QR matrix or customer claim. Below the hero, a capabilities strip introduces secure codes/labels and scan insights/alerts. Three workflow steps: Create → Apply → Connect. Explain that public QR scans reveal product information, while hidden codes verify individual items after purchase. Finish with a dark brand-benefits section and a platform footer without IVORY GLOW’s trademark.

Use Direction A: Plus Jakarta Sans, white and cool neutral surfaces, dark ink and turquoise chrome from packages/ui. Green is reserved for the illustrative authentic result. All colour, spacing, radius, font and motion values consume existing tokens, including Tailwind theme type/breakpoint/container tokens. Decorative geometry uses percentages and aspect ratios. No new palette or shared tokens. The licensed font is served locally from public/fonts; no runtime third-party font request.

Mobile: wrapping navigation, stacked hero with both actions before the illustration, minimum 44px action targets, no horizontal scrolling at 360px. Only the decorative illustration animates, and only when reduced motion is not requested. Keep all hero text/actions stationary for immediate interaction. Hover links retain high-contrast dark text with an underline. No fabricated statistics, endorsements or absolute anti-counterfeit guarantees.

## Integration

PublicShell uses the current pathname to render the platform homepage or the existing tenant-themed shell, including client-side back navigation. Retain locale, offline and service-worker providers. Homepage copy is English, explicitly marked lang=en; existing verification languages stay available on /verify. The server supplies admin links from the existing APP_BASE_URL setting. Compose supplies the worktree admin origin. Deployments must set APP_BASE_URL on web-verify to their public admin origin.

## Validation

Check desktop/mobile appearance, accessible content and hover contrast, keyboard skip link, 360/768/1440px overflow, real signup/login destinations, home→verify→home shell transitions and JavaScript-disabled navigation. Run existing consumer tests and repo lint/typecheck/test/build. Run the browser suite against compose, capture screenshots, and distinguish unrelated baseline failures in the PR evidence.

## Existing onboarding limitation

The signup route is now publicly reachable, with all console/API guards retained. The existing form still needs integration with real account registration and authentication before it can submit a business application; tracked separately in https://github.com/enendufrankc/verifynNG/issues/95. Landing-page coverage demonstrates route access, not completion of that separate onboarding flow.

Rendered Docker previews: [desktop](2026-09-09-landing-desktop.png), [mobile](2026-09-09-landing-mobile.png).
