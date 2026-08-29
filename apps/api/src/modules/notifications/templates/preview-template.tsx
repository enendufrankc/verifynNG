import { Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export function PreviewTemplate({ title }: { title: string }) {
  const branding = { tenantName: 'IVORY GLOW', primaryColor: '#8b5cf6' };
  return (
    <BaseLayout branding={branding} subject={title}>
      <Text>{title}</Text>
      <Text>
        This is sample preview data for the VerifyN notification catalog.
      </Text>
    </BaseLayout>
  );
}
