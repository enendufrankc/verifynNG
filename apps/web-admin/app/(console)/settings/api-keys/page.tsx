import { redirect } from 'next/navigation';

// E16 built API keys at /api-keys (where the nav points); this path was an
// E11 scaffold stub.
export default function LegacyApiKeysPage() {
  redirect('/api-keys');
}
