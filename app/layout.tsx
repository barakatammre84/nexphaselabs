import type { Metadata } from 'next';
import { IBM_Plex_Mono, Sora, Source_Sans_3 } from 'next/font/google';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ResearchNoticeBar } from '@/components/site/research-notice';
import { FeedbackChat } from '@/components/site/feedback-chat';
import { ProductRail } from '@/components/site/product-rail';
import { appEnv } from '@/lib/site-config';
import './globals.css';

const display = Sora({ variable: '--font-display', subsets: ['latin'] });
const body = Source_Sans_3({ variable: '--font-body', subsets: ['latin'] });
const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: {
    default: 'NexPhase Labs | Research Peptides, Verified by Lot',
    template: '%s | NexPhase Labs',
  },
  description:
    'Research materials with clear specifications, released-lot documentation, and traceable fulfillment. For laboratory research use only.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
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
