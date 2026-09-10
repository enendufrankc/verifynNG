'use client';

import Link from 'next/link';
import { AlertTriangleIcon, ClockIcon, LockIcon } from 'lucide-react';

interface StatusBannerProps {
  status: 'pending' | 'in_review' | 'suspended' | 'restricted' | 'active';
  /** Only used for `restricted` — links the banner to the unpaid invoice (AC5/E15). */
  href?: string;
}

export function StatusBanner({ status, href }: StatusBannerProps) {
  if (status === 'active') return null;

  const config = {
    pending: {
      icon: ClockIcon,
      bg: 'bg-v-susp-tint',
      text: 'text-v-susp',
      message: 'Your business is under review. Some features may be limited.',
    },
    in_review: {
      icon: ClockIcon,
      bg: 'bg-v-susp-tint',
      text: 'text-v-susp',
      message: 'Your business is under review. Some features may be limited.',
    },
    suspended: {
      icon: LockIcon,
      bg: 'bg-v-flag-tint',
      text: 'text-v-flag',
      message: 'Console is read-only. Contact support for assistance.',
    },
    // E15 (billing): a restricted tenant may still be read from and still
    // pay its way out — unlike `suspended`, only mutations are blocked
    // (TenantStatusGuard's @AllowWhenSuspended on the pay route), so this
    // links straight to the unpaid invoice instead of a generic support
    // message.
    restricted: {
      icon: AlertTriangleIcon,
      bg: 'bg-v-flag-tint',
      text: 'text-v-flag',
      message: 'Minting is restricted until the outstanding invoice is paid.',
    },
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={`gap-s2 px-s4 py-s2 flex shrink-0 flex-wrap items-center ${config.bg} ${config.text}`}
      role="status"
      data-testid="status-banner"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{config.message}</p>
      {status === 'restricted' && href && (
        <Link
          href={href}
          className="focus-visible:ring-focus ml-auto rounded-xs text-sm font-semibold underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Pay now
        </Link>
      )}
    </div>
  );
}
