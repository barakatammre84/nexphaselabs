declare namespace Cloudflare {
  interface Env {
    /** D1 database. Bound per environment in wrangler.jsonc. */
    DB: D1Database;
    /** Private R2 bucket for COA, SDS, chromatogram and mass-spec files. Never public. */
    DOCS: R2Bucket;
    /** Static assets served by Workers Assets. */
    ASSETS: Fetcher;
    /** One hibernating real-time room per feedback conversation. */
    FEEDBACK_ROOMS: DurableObjectNamespace<
      import('../lib/feedback-room').FeedbackRoom
    >;
    /** "production" | "staging" | "development" */
    APP_ENV: string;
    /** Canonical origin for absolute URLs in email and metadata. */
    PUBLIC_ORIGIN: string;
    /** "true" to allow consumer-tier sign-ups. Owner decision; ships "false". */
    CONSUMER_TIER_ENABLED?: string;
    OPEN_CHECKOUT_ENABLED?: string;
    SHIPPING_PROVIDER?: string;
    SHIPPO_API_KEY?: string;
    SHIPPO_CARRIER_ACCOUNTS?: string;
    SHIPPING_FROM_JSON?: string;
    SHIPPING_DEFAULT_PARCEL_JSON?: string;
    SHIPPING_SIMULATION_ENABLED?: string;
    CHECKOUT_QUOTES_REQUIRED?: string;
    LIVE_SHIPPING_ENABLED?: string;
    TAX_PROVIDER?: string;
    TAXJAR_API_KEY?: string;
    TAXJAR_SANDBOX?: string;
    TAX_SIMULATED_RATE_BPS?: string;
    INVENTORY_RESERVATION_MINUTES?: string;
    /** Sender for transactional email, e.g. "NexPhase Labs <research@nexphaselabs.net>". */
    EMAIL_FROM?: string;
    /** Secret: Resend API key. Set with `wrangler secret put RESEND_API_KEY`. */
    RESEND_API_KEY?: string;
    /** Exact comma-separated mailboxes allowed to receive non-production email. Empty denies all. */
    TEST_EMAIL_ALLOWLIST?: string;
    /** Bank transfer remittance text (bank name, account, routing, SWIFT). Set as a secret. */
    PAYMENT_BANK_INSTRUCTIONS?: string;
    /** BTCPay Server (self-hosted). All four set → Bitcoin checkout is offered; the webhook secret is required so settlement can complete. */
    BTCPAY_HOST?: string;
    BTCPAY_STORE_ID?: string;
    BTCPAY_API_KEY?: string;
    BTCPAY_WEBHOOK_SECRET?: string;
    /** Operations digest: recipient (an ADMIN address — the digest is admin-level content) and the bearer token an external scheduler presents to /api/digest. Both unset → endpoint absent. */
    DIGEST_TO?: string;
    DIGEST_TOKEN?: string;
    /** Secret bearer token for the read-only ChatGPT feedback archive API. */
    CHATGPT_FEEDBACK_READ_TOKEN?: string;
  }
}
