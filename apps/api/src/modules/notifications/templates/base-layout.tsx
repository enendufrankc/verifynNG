import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import type { BrandingData } from './template-data';

export function BaseLayout({
  branding,
  subject,
  children,
}: {
  branding: BrandingData;
  subject: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{ backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            margin: '24px auto',
            maxWidth: '600px',
          }}
        >
          <Section
            style={{
              backgroundColor: branding.primaryColor ?? '#1a1a2e',
              padding: '24px 32px',
            }}
          >
            <Heading style={{ color: '#ffffff', fontSize: '20px' }}>
              {branding.tenantName}
            </Heading>
          </Section>
          <Section style={{ padding: '32px' }}>{children}</Section>
          <Text
            style={{
              borderTop: '1px solid #eee',
              color: '#999',
              fontSize: '12px',
              padding: '16px 32px',
            }}
          >
            {branding.footerAddress ??
              'VerifyN — Product Authenticity Platform'}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
