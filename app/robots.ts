import type { MetadataRoute } from 'next';
import { appEnv } from '@/lib/site-config';

export default function robots(): MetadataRoute.Robots {
  if (appEnv() !== 'production') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/manage', '/staff', '/api'] }],
  };
}
