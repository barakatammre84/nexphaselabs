import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // vinext currently applies this guard before multipart route handlers.
    // Leave room for the widget's 2 MB image plus multipart framing.
    serverActions: { bodySizeLimit: '3mb' },
  },
};

export default nextConfig;
