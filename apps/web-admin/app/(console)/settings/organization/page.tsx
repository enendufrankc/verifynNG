import { Building2 } from 'lucide-react';
import { ModuleEmptyState } from '@/components/module-empty-state';

export default function SettingsOrganizationPage() {
  return (
    <ModuleEmptyState
      icon={Building2}
      title="Organization settings"
      epic="E03"
    />
  );
}
