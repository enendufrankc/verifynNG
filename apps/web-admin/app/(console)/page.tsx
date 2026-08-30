import { LayoutDashboard } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

export default function DashboardPage() {
  return (
    <ModuleEmptyState icon={LayoutDashboard} title="Dashboard" epic="E12" />
  );
}
