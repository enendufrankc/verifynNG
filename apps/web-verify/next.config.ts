import type { NextConfig } from 'next';

const minioPublicUrl =
  process.env.NEXT_PUBLIC_MINIO_PUBLIC_URL ?? 'http://localhost:9000';
const minioUrl = new URL(minioPublicUrl);

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@verifyng/ui'],
  images: {
    remotePatterns: [
      {
        protocol: minioUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: minioUrl.hostname,
        port: minioUrl.port,
      },
    ],
  },
};

export default nextConfig;
