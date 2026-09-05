'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PageHeader,
  useToast,
} from '@verifyng/ui';
import { CheckIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { formatMinor } from '@/lib/format-money';
import { ApiError } from '@/lib/api-client';
import {
  changePlan,
  getSubscription,
  listPlans,
  payInvoice,
  previewChangePlan,
  type Plan,
} from '@/lib/billing';

function planPrice(plan: Plan, currency: 'NGN' | 'GBP'): number {
  return currency === 'NGN'
    ? plan.monthlyPriceNgnMinor
    : plan.monthlyPriceGbpMinor;
}

export default function ChangePlanPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogPlanCode, setDialogPlanCode] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.billing.subscription(tenantId),
    queryFn: () => getSubscription(tenantPath),
    enabled: !!tenantId,
  });
  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: listPlans,
  });

  const subscription = subscriptionQuery.data;
  const currentPlan = (plansQuery.data ?? []).find(
    (p) => p.id === subscription?.planId,
  );

  const previewQuery = useQuery({
    queryKey: queryKeys.billing.changePlanPreview(
      tenantId,
      dialogPlanCode ?? '',
    ),
    queryFn: () => previewChangePlan(tenantPath, dialogPlanCode!),
    enabled: !!tenantId && !!dialogPlanCode,
  });

  const changeMutation = useMutation({
    mutationFn: () => changePlan(tenantPath, dialogPlanCode!, force),
    onSuccess: async ({ prorationInvoice }) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.billing.subscription(tenantId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.billing.usageVsPlan(tenantId),
      });
      setDialogPlanCode(null);
      setForce(false);
      if (prorationInvoice) {
        // Upgrade with a net charge — go straight to checkout, same flow as
        // paying any other issued invoice (AC3: confirm -> checkout).
        try {
          const { checkoutUrl } = await payInvoice(
            tenantPath,
            prorationInvoice.id,
          );
          window.location.href = checkoutUrl;
          return;
        } catch {
          toast({
            title: 'Plan changed — visit Invoices to pay the proration charge',
          });
          return;
        }
      }
      toast({ title: 'Plan updated' });
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not change plan',
        variant: 'destructive',
      });
    },
  });

  const plans = (plansQuery.data ?? [])
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const dialogPlan = plans.find((p) => p.code === dialogPlanCode);
  const preview = previewQuery.data;

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Change plan"
        description="Upgrades apply immediately with a prorated charge for the rest of this period. Downgrades take effect at your next renewal."
        actions={
          <Button variant="outline" asChild>
            <Link href="/billing">Back to overview</Link>
          </Button>
        }
      />

      <div className="gap-s4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === subscription?.planId;
          const isPending = plan.id === subscription?.pendingPlanId;
          const isCustom = Boolean(plan.features.customPricing);
          const price = subscription
            ? planPrice(plan, subscription.currency)
            : plan.monthlyPriceNgnMinor;
          return (
            <div
              key={plan.id}
              className="bg-surface border-border p-s4 flex flex-col gap-2 rounded-md border shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-fg text-lg font-semibold">{plan.name}</h3>
                {isCurrent && <Badge>Current</Badge>}
                {isPending && <Badge variant="secondary">Scheduled</Badge>}
              </div>
              <p className="text-fg text-2xl font-semibold">
                {isCustom
                  ? 'Custom'
                  : `${formatMinor(price, subscription?.currency ?? 'NGN')}/mo`}
              </p>
              <ul className="text-fg-muted flex-1 space-y-1 text-sm">
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  {plan.includedUnitsPerYear.toLocaleString()} units/yr included
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  {plan.includedScansPerMonth.toLocaleString()} scans/mo
                  included
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                  {plan.features.maxApiKeys ?? 1} API key
                  {(plan.features.maxApiKeys ?? 1) === 1 ? '' : 's'}
                </li>
              </ul>
              <Button
                variant={isCurrent ? 'outline' : 'default'}
                disabled={isCurrent || isCustom || isPending}
                onClick={() => setDialogPlanCode(plan.code)}
              >
                {isCurrent
                  ? 'Current plan'
                  : isCustom
                    ? 'Contact support'
                    : isPending
                      ? 'Scheduled'
                      : 'Select'}
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!dialogPlanCode}
        onOpenChange={(open) => {
          if (!open) {
            setDialogPlanCode(null);
            setForce(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentPlan && dialogPlan
                ? `Switch from ${currentPlan.name} to ${dialogPlan.name}?`
                : 'Change plan'}
            </DialogTitle>
          </DialogHeader>

          {previewQuery.isLoading && (
            <p className="text-fg-muted text-sm">Calculating proration…</p>
          )}

          {preview && preview.direction === 'upgrade' && (
            <div className="space-y-2 text-sm">
              <p className="text-fg-muted">
                Effective immediately. Prorated for the rest of this billing
                period:
              </p>
              <div className="flex justify-between">
                <span>Credit — unused time on {currentPlan?.name}</span>
                <span>
                  −{formatMinor(preview.creditMinor, preview.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Charge — remaining time on {dialogPlan?.name}</span>
                <span>
                  {formatMinor(preview.chargeMinor, preview.currency)}
                </span>
              </div>
              <div className="border-border flex justify-between border-t pt-2 font-semibold">
                <span>Due now</span>
                <span>{formatMinor(preview.netMinor, preview.currency)}</span>
              </div>
            </div>
          )}

          {preview && preview.direction === 'downgrade' && (
            <div className="space-y-3 text-sm">
              <p className="text-fg-muted">
                Takes effect at the end of your current billing period. No
                charge now.
              </p>
              {preview.blockedByUnitsCap && (
                <div className="bg-v-flag-tint text-v-flag rounded-md p-3">
                  <p className="font-medium">
                    You&apos;ve used{' '}
                    {preview.blockedByUnitsCap.used.toLocaleString()} units this
                    year — {dialogPlan?.name} only includes{' '}
                    {preview.blockedByUnitsCap.limit.toLocaleString()}.
                  </p>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                    />
                    Schedule anyway — I understand I may be over the new
                    plan&apos;s included allowance.
                  </label>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => changeMutation.mutate()}
              disabled={
                changeMutation.isPending ||
                previewQuery.isLoading ||
                (preview?.direction === 'downgrade' &&
                  !!preview.blockedByUnitsCap &&
                  !force)
              }
            >
              {changeMutation.isPending ? 'Confirming…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
