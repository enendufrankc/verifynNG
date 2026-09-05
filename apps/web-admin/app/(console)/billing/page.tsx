'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  KpiTile,
  PageHeader,
  ProgressBar,
  StatusChip,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { formatMinor } from '@/lib/format-money';
import {
  getSubscription,
  getUsageVsPlan,
  listPlans,
  type SubscriptionStatus,
} from '@/lib/billing';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past due',
  restricted: 'Restricted',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<
  SubscriptionStatus,
  'info' | 'success' | 'warning' | 'danger' | 'neutral'
> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  restricted: 'danger',
  cancelled: 'neutral',
};

function daysUntil(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

export default function BillingOverviewPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.billing.subscription(tenantId),
    queryFn: () => getSubscription(tenantPath),
    enabled: !!tenantId,
  });
  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: listPlans,
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.billing.usageVsPlan(tenantId),
    queryFn: () => getUsageVsPlan(tenantPath),
    enabled: !!tenantId,
  });

  const subscription = subscriptionQuery.data;
  const plan = (plansQuery.data ?? []).find(
    (p) => p.id === subscription?.planId,
  );
  const usage = usageQuery.data;

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Billing"
        description="Plan, usage, and payment status for this organization."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/billing/payment-methods">Payment methods</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/billing/invoices">Invoices</Link>
            </Button>
            <Button asChild>
              <Link href="/billing/change-plan">Change plan</Link>
            </Button>
          </div>
        }
      />

      {subscription?.status === 'restricted' && (
        <div className="bg-v-flag-tint text-v-flag flex items-center gap-3 rounded-md px-4 py-3">
          <AlertTriangleIcon className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">
            Minting is restricted until the outstanding invoice is paid.
          </p>
          <Button size="sm" variant="outline" asChild className="ml-auto">
            <Link href="/billing/invoices">Pay now</Link>
          </Button>
        </div>
      )}

      <div className="gap-s4 grid grid-cols-2 md:grid-cols-4">
        <KpiTile label="Plan" value={plan?.name ?? '—'} />
        <div className="bg-surface border-border p-s4 rounded-md border shadow-sm">
          <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
            Status
          </div>
          <div className="mt-1">
            {subscription ? (
              <StatusChip variant={STATUS_VARIANT[subscription.status]}>
                {STATUS_LABEL[subscription.status]}
              </StatusChip>
            ) : (
              '—'
            )}
          </div>
        </div>
        <KpiTile label="Currency" value={subscription?.currency ?? '—'} />
        <KpiTile
          label={
            subscription?.status === 'trialing' ? 'Trial ends in' : 'Renews in'
          }
          value={
            subscription
              ? subscription.status === 'trialing' && subscription.trialEndsAt
                ? `${daysUntil(subscription.trialEndsAt)}d`
                : `${daysUntil(subscription.currentPeriodEnd)}d`
              : '—'
          }
        />
      </div>

      <div className="bg-surface border-border p-s4 space-y-s4 rounded-md border shadow-sm">
        <h2 className="text-fg text-sm font-semibold">
          Usage this period{usage ? ` — ${usage.period}` : ''}
        </h2>
        <ProgressBar
          label={`Units minted (${usage?.unitsMinted ?? 0} / ${usage?.includedUnits ?? 0})`}
          value={usage?.unitsMinted ?? 0}
          max={Math.max(1, usage?.includedUnits ?? 1)}
          showValue
        />
        <ProgressBar
          label={`Scans recorded (${usage?.scansRecorded ?? 0} / ${usage?.includedScans ?? 0})`}
          value={usage?.scansRecorded ?? 0}
          max={Math.max(1, usage?.includedScans ?? 1)}
          showValue
        />
        {usage && usage.projectedOverageMinor > 0 && subscription && (
          <p className="text-fg-muted text-sm">
            Projected overage this period:{' '}
            <span className="text-fg font-medium">
              {formatMinor(usage.projectedOverageMinor, subscription.currency)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
