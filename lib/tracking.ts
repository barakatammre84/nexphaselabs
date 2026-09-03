/** Carrier tracking links from a carrier name and tracking number. Pure. */

const CARRIERS: { match: RegExp; url: (n: string) => string }[] = [
  { match: /\bups\b/i, url: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  { match: /fedex/i, url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  { match: /\busps\b|postal/i, url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}` },
  { match: /\bdhl\b/i, url: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}` },
];

export function trackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
  if (!carrier || !trackingNumber) return null;
  const clean = trackingNumber.trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(clean)) return null;
  const hit = CARRIERS.find((c) => c.match.test(carrier));
  return hit ? hit.url(clean) : null;
}
