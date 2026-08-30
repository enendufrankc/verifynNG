# Tenant lifecycle

E03 owns the tenant trust gate. A tenant starts as `pending`, moves to `in_review` only after the CAC certificate and director ID are uploaded and current AUP/ToS versions are accepted, and becomes `active` only after support approval. `rejected` can return to review; `suspended` and `restricted` block tenant writes while public verification remains available; `offboarded` returns HTTP 410 except for export retrieval.

Tenant-scoped routes use the authenticated tenant context. Until E02 publishes its JWT guards, local development accepts `x-user-id`, `x-tenant-id`, `x-role`, and `x-platform-role` headers. These are compatibility inputs only and must be replaced by E02's `@Principal()` and tenant context guard before production.

The document flow returns an object key under `tenants/{tenantId}/verification/`; the bucket is private and downloads must be presigned. Raw tier-2 codes are never part of tenant lifecycle exports.
