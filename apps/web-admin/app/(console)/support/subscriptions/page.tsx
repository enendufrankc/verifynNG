import { CreditCard } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

// E15 owns this route group inside E18's support shell (see
// docs/epics/CROSS-EPIC-REQUESTS.md "Decisions recorded while resolving
// conflicts" and E18's "Notes and decisions").
export default function SupportSubscriptionsPage() {
  return (
    <ModuleEmptyState icon={CreditCard} title="Subscriptions" epic="E15" />
  );
}
