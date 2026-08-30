import { MessageSquareWarning } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

export default function ReportsPage() {
  return (
    <ModuleEmptyState icon={MessageSquareWarning} title="Reports" epic="E08" />
  );
}
