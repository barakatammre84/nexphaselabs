import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // vinext applies this limit to every multipart POST (route handlers included)
    // and reads the form before the handler runs. Keep it small: the feedback
    // widget's 2 MB screenshot plus framing is the largest body that should meet it.
    // Document and image uploads (up to 25 MB) are relabelled in worker.ts and never
    // do; see lib/large-uploads.ts.
    serverActions: { bodySizeLimit: '3mb' },
  },
};

export default nextConfig;
