import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Sora, Source_Sans_3 } from 'next/font/google';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ResearchNoticeBar } from '@/components/site/research-notice';
import { EntryNotice } from '@/components/site/entry-notice';
import { FeedbackChat } from '@/components/site/feedback-chat';
import { ProductRail } from '@/components/site/product-rail';
import { appEnv, webAnalyticsToken } from '@/lib/site-config';
import { jsonLdScript, organizationJsonLd } from '@/lib/structured-data';
import { ENTITY } from '@/lib/entity';
import { BRAND_NAVY } from '@/lib/brand-mark';
import './globals.css';

const display = Sora({ variable: '--font-display', subsets: ['latin'] });
const body = Source_Sans_3({ variable: '--font-body', subsets: ['latin'] });
const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${ENTITY.website}`),
  title: {
    default: 'NexPhase Labs | Research Peptides, Verified by Lot',
    template: '%s | NexPhase Labs',
  },
  description:
    'Research materials with clear specifications, released-lot documentation, and traceable fulfillment. For laboratory research use only.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    siteName: 'NexPhase Labs',
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: 'NexPhase Labs' },
    ],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
};

export const viewport: Viewport = {
  themeColor: BRAND_NAVY,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const analyticsToken = webAnalyticsToken();
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        {/* Organization + WebSite only (lib/structured-data.ts): no offers, ratings or search action. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }} />
        {analyticsToken && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: analyticsToken })}
          />
        )}
        <EntryNotice />
        <ResearchNoticeBar />
        {appEnv() !== 'production' && (
          <div
            role="status"
            className="environment-banner bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
          >
            Test environment — synthetic records only. Payments are simulated;
            do not send money or ship material.
          </div>
        )}
        <SiteHeader />
        {children}
        <ProductRail />
        <FeedbackChat />
        <SiteFooter />
      </body>
    </html>
  );
}
