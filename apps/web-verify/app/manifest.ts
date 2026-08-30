import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Verify Platform',
    short_name: 'Verify',
    description: 'Scan a QR code to verify your product',
    start_url: '/verify',
    display: 'standalone',
    background_color: '#D9DCEF',
    theme_color: '#5AE9D7',
  };
}
