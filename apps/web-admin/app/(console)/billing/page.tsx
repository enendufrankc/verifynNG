import { CreditCard } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

export default function BillingPage() {
  return <ModuleEmptyState icon={CreditCard} title="Billing" epic="E15" />;
}
