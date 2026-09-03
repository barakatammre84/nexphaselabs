declare namespace Cloudflare {
  interface Env {
    /** D1 database. Bound per environment in wrangler.jsonc. */
    DB: D1Database;
    /** Private R2 bucket for COA, SDS, chromatogram and mass-spec files. Never public. */
    DOCS: R2Bucket;
    /** Static assets served by Workers Assets. */
    ASSETS: Fetcher;
    /** "production" | "staging" | "development" */
    APP_ENV: string;
    /** Canonical origin for absolute URLs in email and metadata. */
    PUBLIC_ORIGIN: string;
    /** "true" to allow consumer-tier sign-ups. Owner decision; ships "false". */
    CONSUMER_TIER_ENABLED?: string;
    /** Sender for transactional email, e.g. "NexPhase Labs <research@nexphaselabs.net>". */
    EMAIL_FROM?: string;
    /** Secret: Resend API key. Set with `wrangler secret put RESEND_API_KEY`. */
    RESEND_API_KEY?: string;
  }
}
