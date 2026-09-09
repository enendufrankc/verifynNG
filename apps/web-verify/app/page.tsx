import type { Metadata } from 'next';
import { loadEnv } from '@verifynng/config';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'Verify — Build trust into every product',
  description:
    'Create secure product codes, QR labels, and hidden verification codes for your brand. Help customers check authenticity and follow product scans.',
};

export default function Home() {
  return <LandingPage adminBaseUrl={loadEnv().APP_BASE_URL} />;
}
