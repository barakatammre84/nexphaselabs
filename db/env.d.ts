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
    /** Researcher (non-institutional) tier switch. CONSUMER_TIER_ENABLED is the legacy alias. */
    RESEARCHER_TIER_ENABLED?: string;
    CONSUMER_TIER_ENABLED?: string;
    OPEN_CHECKOUT_ENABLED?: string;
    /** Basic-auth password for a deployed non-production storefront. Unset = the environment refuses every request with 503. */
    STAGING_ACCESS_PASSWORD?: string;
    POLICIES_COUNSEL_REVIEWED?: string;
    /** "true" deliberately opens a deployed non-production storefront to anyone. A stated choice, never a default. */
    STAGING_ACCESS_OPEN?: string;
    SHIPPING_PROVIDER?: string;
    SHIPPO_API_KEY?: string;
    /** Secret URL token for Shippo webhook calls; at least 32 random characters. */
    SHIPPO_WEBHOOK_TOKEN?: string;
    SHIPPO_CARRIER_ACCOUNTS?: string;
    /** Protected deployed ship-from contact; preferred over the local SHIPPING_FROM_JSON setting. */
    SHIPPO_FROM_JSON?: string;
    /** Protected array of named ship-from locations. The first active entry is the checkout default. */
    SHIPPO_ORIGINS_JSON?: string;
    SHIPPING_FROM_JSON?: string;
    SHIPPING_DEFAULT_PARCEL_JSON?: string;
    SHIPPING_ALLOWED_SERVICES?: string;
    SHIPPING_SIMULATION_ENABLED?: string;
    CHECKOUT_QUOTES_REQUIRED?: string;
    LIVE_SHIPPING_ENABLED?: string;
    TAX_PROVIDER?: string;
    /** CDTFA provider: 'destination' (default, full local rate) or 'statewide' (7.25% base only). */
    CDTFA_DISTRICT_RATE?: string;
    /** CDTFA provider: 'true' taxes shipping. California normally does not. */
    CDTFA_TAX_SHIPPING?: string;
    TAXJAR_API_KEY?: string;
    TAXJAR_SANDBOX?: string;
    TAX_SIMULATED_RATE_BPS?: string;
    INVENTORY_RESERVATION_MINUTES?: string;
    /** Sender for transactional email, e.g. "NexPhase Labs <research@nexphaselabs.net>". */
    EMAIL_FROM?: string;
    /** 'purpose' switches on per-purpose senders (lib/senders.ts); anything else = EMAIL_FROM for everything. */
    EMAIL_SENDER_SCHEME?: string;
    EMAIL_FROM_ORDERS?: string;
    EMAIL_FROM_SUPPORT?: string;
    EMAIL_FROM_ACCOUNTS?: string;
    EMAIL_FROM_QUALITY?: string;
    /** "google_workspace" (recommended) or "resend". */
    EMAIL_PROVIDER?: string;
    /** Optional Google Workspace service account with domain-wide delegation. */
    GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL?: string;
    /** Secret PKCS#8 PEM key belonging to the delegated service account. */
    GOOGLE_WORKSPACE_PRIVATE_KEY?: string;
    /** Workspace mailbox impersonated for Gmail API sends. */
    GOOGLE_WORKSPACE_SENDER?: string;
    /** OAuth client for one approved Workspace mailbox; preferred when service-account keys are prohibited. */
    GOOGLE_WORKSPACE_OAUTH_CLIENT_ID?: string;
    /** Secret paired with GOOGLE_WORKSPACE_OAUTH_CLIENT_ID. */
    GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET?: string;
    /** Secret offline-access token granted with exactly gmail.send. */
    GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN?: string;
    /** Secret: Resend API key. Set with `wrangler secret put RESEND_API_KEY`. */
    RESEND_API_KEY?: string;
    /** Exact comma-separated mailboxes allowed to receive non-production email. Empty denies all. */
    TEST_EMAIL_ALLOWLIST?: string;
    /** Bank transfer remittance text (bank name, account, routing, SWIFT). Set as a secret. */
    PAYMENT_BANK_INSTRUCTIONS?: string;
    /** disabled | manual | shadow | supervised | automatic. Only production can expose live Zelle instructions. */
    ZELLE_MODE?: string;
    /** Zelle identity enrolled at Chase. Defaults to orders@nexphaselabs.net when unset. */
    ZELLE_RECIPIENT_EMAIL?: string;
    /** Exact business name Chase shows a sender before they confirm payment. */
    ZELLE_RECIPIENT_NAME?: string;
    /** Optional site-local path to the official Chase-exported QR image. */
    ZELLE_QR_IMAGE_PATH?: string;
    /** Licensed Workspace mailbox that receives the orders@ alias. */
    ZELLE_GMAIL_MAILBOX?: string;
    /** Exact comma-separated Chase sender addresses observed in real receipt messages. */
    ZELLE_CHASE_SENDERS?: string;
    /** Separate read-only Gmail refresh token. Never reuse the send-only token. */
    ZELLE_GMAIL_OAUTH_REFRESH_TOKEN?: string;
    /** Optional dedicated OAuth client; falls back to the transactional-mail client id/secret. */
    ZELLE_GMAIL_OAUTH_CLIENT_ID?: string;
    ZELLE_GMAIL_OAUTH_CLIENT_SECRET?: string;
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
