import { ShieldAlert } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

export default function AnomaliesPage() {
  return <ModuleEmptyState icon={ShieldAlert} title="Anomalies" epic="E07" />;
}
