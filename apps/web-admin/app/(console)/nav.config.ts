import {
  LayoutDashboard,
  Package,
  Factory,
  Layers,
  Truck,
  ScanLine,
  Activity,
  ShieldAlert,
  MessageSquareWarning,
  BarChart3,
  Users,
  ScrollText,
  CreditCard,
  Settings,
  LifeBuoy,
  FileText,
  Siren,
  Trash2,
  Download,
  FileStackIcon,
  KeyRound,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: 'overview' | 'catalog' | 'monitoring' | 'organization' | 'platform';
  minRole?: 'viewer' | 'operator' | 'owner';
  platformRole?: 'support';
  badge?: () => Promise<number | null>;
  order: number;
};

export const NAV: NavEntry[] = [
  {
    id: 'overview.dashboard',
    label: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
    section: 'overview',
    order: 1,
  },
  {
    id: 'catalog.products',
    label: 'Products',
    href: '/products',
    icon: Package,
    section: 'catalog',
    order: 10,
  },
  {
    id: 'catalog.oems',
    label: 'OEMs',
    href: '/oems',
    icon: Factory,
    section: 'catalog',
    order: 20,
  },
  {
    id: 'catalog.batches',
    label: 'Batches',
    href: '/batches',
    icon: Layers,
    section: 'catalog',
    order: 30,
  },
  {
    id: 'catalog.deliveries',
    label: 'Deliveries',
    href: '/deliveries',
    icon: Truck,
    section: 'catalog',
    order: 40,
  },
  {
    id: 'catalog.pages',
    label: 'Pages',
    href: '/pages',
    icon: FileStackIcon,
    section: 'catalog',
    order: 50,
  },
  {
    id: 'monitoring.units',
    label: 'Units',
    href: '/units',
    icon: ScanLine,
    section: 'monitoring',
    order: 10,
  },
  {
    id: 'monitoring.anomalies',
    label: 'Anomalies',
    href: '/anomalies',
    icon: ShieldAlert,
    section: 'monitoring',
    order: 20,
    badge: async () => {
      try {
        const summary = await apiClient.get<{ open: number }>(
          '/v1/anomalies/summary',
        );
        return summary.open > 0 ? summary.open : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'monitoring.reports',
    label: 'Reports',
    href: '/reports',
    icon: MessageSquareWarning,
    section: 'monitoring',
    order: 30,
  },
  {
    id: 'monitoring.scans',
    label: 'Scans',
    href: '/scans',
    icon: Activity,
    section: 'monitoring',
    order: 40,
  },
  {
    id: 'monitoring.analytics',
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    section: 'monitoring',
    order: 50,
  },
  {
    id: 'organization.team',
    label: 'Team',
    href: '/team',
    icon: Users,
    section: 'organization',
    order: 10,
  },
  {
    id: 'organization.audit',
    label: 'Audit log',
    href: '/audit',
    icon: ScrollText,
    section: 'organization',
    minRole: 'owner',
    order: 20,
  },
  {
    id: 'organization.billing',
    label: 'Billing',
    href: '/billing',
    icon: CreditCard,
    section: 'organization',
    minRole: 'owner',
    order: 30,
  },
  {
    id: 'organization.settings',
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    section: 'organization',
    order: 40,
  },
  {
    id: 'organization.apiKeys',
    label: 'API keys',
    href: '/api-keys',
    icon: KeyRound,
    section: 'organization',
    order: 45,
  },
  {
    id: 'organization.webhooks',
    label: 'Webhooks',
    href: '/webhooks',
    icon: Webhook,
    section: 'organization',
    order: 46,
  },
  {
    id: 'organization.legal',
    label: 'Your agreements',
    href: '/legal',
    icon: FileText,
    section: 'organization',
    order: 50,
  },
  {
    id: 'organization.complianceDsar',
    label: 'Data export',
    href: '/compliance/dsar',
    icon: Download,
    section: 'organization',
    minRole: 'owner',
    order: 60,
  },
  {
    id: 'organization.complianceIncidents',
    label: 'Incidents',
    href: '/compliance/incidents',
    icon: Siren,
    section: 'organization',
    order: 70,
  },
  {
    id: 'organization.retentionSchedule',
    label: 'Retention schedule',
    href: '/compliance/retention',
    icon: Trash2,
    section: 'organization',
    order: 80,
  },
  {
    id: 'platform.support',
    label: 'Support',
    href: '/support',
    icon: LifeBuoy,
    section: 'platform',
    platformRole: 'support',
    order: 10,
  },
  {
    id: 'platform.legalDocs',
    label: 'Legal docs',
    href: '/legal-docs',
    icon: FileText,
    section: 'platform',
    platformRole: 'support',
    order: 20,
  },
  {
    id: 'platform.incidents',
    label: 'Incidents',
    href: '/incidents',
    icon: Siren,
    section: 'platform',
    platformRole: 'support',
    order: 30,
  },
  {
    id: 'platform.retention',
    label: 'Retention',
    href: '/compliance/retention',
    icon: Trash2,
    section: 'platform',
    platformRole: 'support',
    order: 40,
  },
  {
    id: 'platform.subscriptions',
    label: 'Subscriptions',
    href: '/support/subscriptions',
    icon: CreditCard,
    section: 'platform',
    platformRole: 'support',
    order: 50,
  },
];

export const NAV_SECTIONS: Record<
  NavEntry['section'],
  { label: string; order: number }
> = {
  overview: { label: 'Overview', order: 1 },
  catalog: { label: 'Catalog', order: 2 },
  monitoring: { label: 'Monitoring', order: 3 },
  organization: { label: 'Organization', order: 4 },
  platform: { label: 'Platform', order: 5 },
};
