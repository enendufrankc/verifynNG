import { EmptyState } from '@verifyng/ui';
import type { LucideIcon } from 'lucide-react';

export function ModuleEmptyState({
  icon,
  title,
  epic,
}: {
  icon: LucideIcon;
  title: string;
  epic: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={`Owned by ${epic} — see docs/epics/${epic}-*.md for scope and status.`}
    />
  );
}
