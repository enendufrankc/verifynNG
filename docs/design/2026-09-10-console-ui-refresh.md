# Verify console visual contract

The console extends the landing page's calm, product-led character into a working environment for product owners. It should feel quiet and precise: warm white surfaces, nearly-black ink, Plus Jakarta Sans for interface text, IBM Plex Mono for codes and identifiers, and turquoise reserved for the primary action and active product signal.

## Shared rules

- Use the semantic tokens in `packages/ui/src/tokens.css`; route CSS must not introduce new palette values.
- Use the existing spacing scale (`s1` through `s20`) and radius scale (`xs` through `full`).
- Prefer 1px borders and `shadow-sm` or `shadow-md`; reserve `shadow-lg` for a focused dialog or a high-priority result.
- Keep one clear primary action per page. Secondary actions use outline or ghost treatments and remain visually quiet.
- Focus rings use `--color-focus` with a visible offset. Controls retain at least a 44px touch target.
- Tables may be compact, but headers, row actions, and empty states must remain readable at 360px.
- Motion is limited to opacity and transform; reduced-motion users receive the same content without animation.

## Reference states

### Authentication

The auth card is a white surface on the soft neutral canvas. The heading is dark ink, supporting copy is muted ink, and the submit action is a turquoise pill or rounded rectangle using the shared Button component. Errors use the locked flagged-verdict tint and colour. Signup uses the same card and form grammar while preserving its multi-step progress and document upload states.

### Product table

The page header has a concise title, one sentence of supporting copy, and one primary action. The table uses a quiet border, generous row padding, mono treatment only for SKU/GTIN identifiers, and semantic badges for Active and Archived. Empty and error states share one centered pattern with an icon, short explanation, and a single recovery action where one exists.

### Batch creation

The form is grouped into short sections on a white surface, with labels above controls and errors adjacent to the affected field. The primary action is placed in a persistent, clearly separated footer on small screens. Sensitive values remain masked or omitted according to the platform's existing tier-2 handling rules.

## Protected semantics

Tenant theme overrides continue to control tenant identity. Verdict colours, labels, and icon meanings remain platform-locked. This refresh changes composition and hierarchy around those semantics, never the verdict contract itself.
