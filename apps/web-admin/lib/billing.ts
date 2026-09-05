import { apiClient } from './api-client';
import { useAuthStore } from './auth-store';

// E15's TenantBillingController is mounted at `v1/tenants/:tenantId/billing`
// — unlike E02/E04's tenant-scoped routes (`tenantPath()` alone), this one
// needs the `/v1` prefix added explicitly.
function billingPath(
  tenantPath: (path: string) => string,
  path: string,
): string {
  return `/v1${tenantPath(`/billing${path}`)}`;
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'restricted'
  | 'cancelled';
export type Currency = 'NGN' | 'GBP';
export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currency: Currency;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  pendingPlanId: string | null;
  restrictedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFeatures {
  publicApi?: boolean;
  webhooks?: boolean;
  sso?: boolean;
  customPages?: boolean;
  maxApiKeys?: number;
  apiRateLimitPerMin?: number;
  trialTotalCap?: boolean;
  hardCap?: boolean;
  customPricing?: boolean;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  monthlyPriceNgnMinor: number;
  monthlyPriceGbpMinor: number;
  includedUnitsPerYear: number;
  includedScansPerMonth: number;
  overageUnitPriceNgnMinor: number;
  overageUnitPriceGbpMinor: number;
  overageScanPriceNgnMinor: number;
  overageScanPriceGbpMinor: number;
  features: PlanFeatures;
  sortOrder: number;
  active: boolean;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  number: string;
  status: InvoiceStatus;
  currency: Currency;
  periodStart: string;
  periodEnd: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  attemptCount: number;
  createdAt: string;
  lines?: InvoiceLine[];
}

export interface PaymentMethod {
  id: string;
  provider: 'paystack' | 'fake' | 'manual';
  cardBrand: string | null;
  cardLast4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt: string;
}

export interface ChangePlanPreview {
  currentPlanCode: string;
  targetPlanCode: string;
  direction: 'upgrade' | 'downgrade' | 'unchanged';
  currency: Currency;
  remainingFraction: number;
  creditMinor: number;
  chargeMinor: number;
  netMinor: number;
  effective: 'now' | 'period_end';
  blockedByUnitsCap: { used: number; limit: number } | null;
}

export interface UsageVsPlan {
  period: string;
  unitsMinted: number;
  includedUnits: number;
  scansRecorded: number;
  includedScans: number;
  projectedOverageMinor: number;
}

export interface PlatformSubscriptionRow {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  currency: Currency;
  mrrMinor: number;
  nextInvoiceAt: string;
  overdueMinor: number;
  overdueInvoiceId: string | null;
}

/** Platform-support only (`@PlatformRole('support')`) — not tenant-scoped, so no `tenantPath` needed. */
export function listPlatformSubscriptions(filters: {
  status?: SubscriptionStatus;
  planCode?: string;
  currency?: Currency;
}) {
  const query: Record<string, string> = {};
  if (filters.status) query.status = filters.status;
  if (filters.planCode) query.planCode = filters.planCode;
  if (filters.currency) query.currency = filters.currency;
  return apiClient.get<PlatformSubscriptionRow[]>(
    '/v1/platform/subscriptions',
    {
      query,
    },
  );
}

export function getTenantInvoicesForSupport(tenantId: string) {
  return apiClient.get<{ invoices: Invoice[]; nextCursor: string | null }>(
    `/v1/platform/subscriptions/${tenantId}/invoices`,
  );
}

export function markInvoicePaidManually(invoiceId: string, reason: string) {
  return apiClient.post<Invoice>(
    `/v1/platform/subscriptions/${invoiceId}/mark-paid`,
    { reason },
  );
}

export function listPlans() {
  return apiClient.get<Plan[]>('/v1/billing/plans');
}

export function getSubscription(tenantPath: (path: string) => string) {
  return apiClient.get<Subscription | null>(
    billingPath(tenantPath, '/subscription'),
  );
}

/**
 * Any tenant role can call this — `getSubscription` above is owner-only, but
 * the shared console shell's restricted-status banner has to render for
 * every role, not just the owner.
 */
export function getSubscriptionStatus(tenantPath: (path: string) => string) {
  return apiClient.get<{ status: SubscriptionStatus | null }>(
    billingPath(tenantPath, '/status'),
  );
}

export function getUsageVsPlan(tenantPath: (path: string) => string) {
  return apiClient.get<UsageVsPlan>(billingPath(tenantPath, '/usage-vs-plan'));
}

export function previewChangePlan(
  tenantPath: (path: string) => string,
  planCode: string,
) {
  return apiClient.get<ChangePlanPreview>(
    billingPath(tenantPath, '/subscription/change-plan-preview'),
    { query: { planCode } },
  );
}

export function changePlan(
  tenantPath: (path: string) => string,
  planCode: string,
  force?: boolean,
) {
  return apiClient.post<{
    subscription: Subscription;
    prorationInvoice: Invoice | null;
  }>(billingPath(tenantPath, '/subscription/change'), { planCode, force });
}

export function listInvoices(
  tenantPath: (path: string) => string,
  cursor?: string,
) {
  return apiClient.get<{ invoices: Invoice[]; nextCursor: string | null }>(
    billingPath(tenantPath, '/invoices'),
    cursor ? { query: { cursor } } : undefined,
  );
}

export function getInvoice(
  tenantPath: (path: string) => string,
  invoiceId: string,
) {
  return apiClient.get<Invoice>(
    billingPath(tenantPath, `/invoices/${invoiceId}`),
  );
}

export function payInvoice(
  tenantPath: (path: string) => string,
  invoiceId: string,
) {
  return apiClient.post<{ checkoutUrl: string }>(
    billingPath(tenantPath, `/invoices/${invoiceId}/pay`),
  );
}

export function listPaymentMethods(tenantPath: (path: string) => string) {
  return apiClient.get<PaymentMethod[]>(
    billingPath(tenantPath, '/payment-methods'),
  );
}

export function removePaymentMethod(
  tenantPath: (path: string) => string,
  methodId: string,
) {
  return apiClient.delete<{ removed: true }>(
    billingPath(tenantPath, `/payment-methods/${methodId}`),
  );
}

/**
 * The PDF route requires the caller's JWT, so a plain `<a href>` won't carry
 * the Authorization header (same reasoning as `lib/batches.ts`'s
 * `downloadArtefact`) — fetch the bytes ourselves and save the blob.
 */
export async function downloadInvoicePdf(
  tenantPath: (path: string) => string,
  invoiceId: string,
  fileName: string,
): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(
    new URL(billingPath(tenantPath, `/invoices/${invoiceId}/pdf`), API_BASE),
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
