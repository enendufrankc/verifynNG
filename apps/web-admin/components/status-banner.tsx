'use client';

import { ClockIcon, LockIcon } from 'lucide-react';

interface StatusBannerProps {
  status: 'pending' | 'in_review' | 'suspended' | 'active';
}

export function StatusBanner({ status }: StatusBannerProps) {
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
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${config.bg} ${config.text}`}
      role="status"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{config.message}</p>
    </div>
  );
}
