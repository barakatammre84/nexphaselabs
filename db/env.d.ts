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
  }
}
