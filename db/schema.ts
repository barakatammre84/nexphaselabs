import { sql } from 'drizzle-orm';
export { notifications, notificationEvents } from './notifications-schema';
export {
  feedbackConversations,
  feedbackEvents,
  feedbackMessages,
  feedbackNotes,
} from './feedback-schema';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * The lot is the unit of truth. Every analytical document, every shipment and
 * every disposition decision keys to a lot number, never to a SKU.
 *
 * Four design decisions here are compliance requirements, not preferences:
 *
 *  - `status` defaults to 'quarantine'. Material is not sellable until a named
 *    person releases it and the release is recorded with who and when. There is
 *    no code path that makes a lot available implicitly.
 *  - Nothing is ever hard-deleted. Corrections are new rows; `supersededById`
 *    points at the replacement. Inspectors and insurers ask for the history,
 *    not the current state.
 *  - `manufacturerName` and `manufacturerAddress` are required before release.
 *    California 16 CCR 1736.9(d) provides that a certificate of analysis
 *    received from a supplier must give the name and address of the
 *    MANUFACTURER, and that material supplied without it may not be used. A COA
 *    from a distributor or broker does not satisfy this.
 *  - Heavy-metal results are captured because contamination in bulk powder,
 *    not the active substance, is the realistic Proposition 65 exposure.
 */
export const lots = sqliteTable(
  'lots',
  {
    id: text('id').primaryKey(),
    lotNumber: text('lot_number').notNull(),

    /** Denormalised deliberately: a lot record must stay readable if the
     *  catalog entry is later withdrawn. */
    productCode: text('product_code').notNull(),
    productName: text('product_name').notNull(),
    casNumber: text('cas_number').notNull(),

    // Provenance
    manufacturerName: text('manufacturer_name'),
    manufacturerAddress: text('manufacturer_address'),
    supplierName: text('supplier_name'),
    countryOfOrigin: text('country_of_origin'),
    entryNumber: text('entry_number'),
    manufactureDate: integer('manufacture_date', { mode: 'timestamp' }),
    receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),

    // Analytical
    purityResult: text('purity_result'),
    purityMethod: text('purity_method'),
    identityConfirmed: integer('identity_confirmed', { mode: 'boolean' })
      .notNull()
      .default(false),
    identityMethod: text('identity_method'),
    waterContent: text('water_content'),
    heavyMetalsSummary: text('heavy_metals_summary'),

    // ---- Independent verification -------------------------------------
    // Added 2026-09-03 after a teardown of the category's highest-traffic
    // site. Their COA archive is searchable by accession number — the
    // ANALYTICAL LAB's own reference for the sample. That is what lets a
    // customer verify a certificate with the lab instead of taking our word
    // for it, and it is the single practice in this category most worth
    // copying. They do not name their lab anywhere in site copy; we do.
    /** The testing laboratory's own reference for the submitted sample. */
    accessionNumber: text('accession_number'),
    /** Named publicly. An unnamed lab is an unverifiable claim. */
    analyticalLab: text('analytical_lab'),
    /** Measured net peptide content, distinct from chromatographic purity. */
    netPeptideContent: text('net_peptide_content'),
    /** Appearance as reported by the lab, e.g. "white lyophilised solid". */
    appearance: text('appearance'),
    /**
     * Which testing panel was in force when this lot was certified. Records
     * issued under an earlier panel say so rather than being quietly
     * back-filled — the honest version of a standards change.
     */
    testingStandard: text('testing_standard'),

    // Documents — object storage keys, never public URLs
    coaKey: text('coa_key'),
    chromatogramKey: text('chromatogram_key'),
    massSpecKey: text('mass_spec_key'),
    sdsKey: text('sds_key'),

    /** quarantine | released | on_hold | rejected | withdrawn | exhausted */
    status: text('status').notNull().default('quarantine'),
    releasedBy: text('released_by'),
    releasedAt: integer('released_at', { mode: 'timestamp' }),
    /** Required whenever status is not 'released'. */
    statusReason: text('status_reason'),

    quantityReceived: text('quantity_received'),
    quantityRemaining: text('quantity_remaining'),
    /** Landed cost of the whole lot in cents (material + freight + duty), for margin per order. */
    costCents: integer('cost_cents'),
    costNote: text('cost_note'),
    storageLocation: text('storage_location'),
    storageCondition: text('storage_condition'),
    retestDate: integer('retest_date', { mode: 'timestamp' }),

    supersededById: text('superseded_by_id'),
    /** Expected receipt this lot arrived against, when procurement raised one. */
    purchaseOrderLineId: text('purchase_order_line_id'),
    /** Marker of the shipment that last drew on this lot; every ledger write for that shipment is conditional on it. */
    lastMovementId: text('last_movement_id'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** One CURRENT record per lot number; superseded versions keep the number so the family stays findable. */
    lotNumberIdx: uniqueIndex('lots_lot_number_current_idx')
      .on(table.lotNumber)
      .where(sql`superseded_by_id IS NULL`),
    lotNumberLookupIdx: index('lots_lot_number_idx2').on(table.lotNumber),
    productIdx: index('lots_product_idx').on(table.productCode),
    statusIdx: index('lots_status_idx').on(table.status),
    accessionIdx: index('lots_accession_idx').on(table.accessionNumber),
  }),
);

/** One row per test per lot, so a result can be cited precisely rather than summarised. */
export const lotTests = sqliteTable(
  'lot_tests',
  {
    id: text('id').primaryKey(),
    lotId: text('lot_id').notNull(),
    /** identity | purity | water | endotoxin | heavy_metal | residual_solvent */
    testType: text('test_type').notNull(),
    analyte: text('analyte'),
    method: text('method').notNull(),
    result: text('result').notNull(),
    specification: text('specification'),
    passed: integer('passed', { mode: 'boolean' }),
    testedBy: text('tested_by'),
    testedAt: integer('tested_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    lotIdx: index('lot_tests_lot_idx').on(table.lotId),
  }),
);

/**
 * Disposition history. One row per decision — release, hold, reject,
 * withdraw — with the named person and the reason. The lot row carries the
 * current status; this table carries how it got there.
 */
export const lotStatusEvents = sqliteTable(
  'lot_status_events',
  {
    id: text('id').primaryKey(),
    lotId: text('lot_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    decidedBy: text('decided_by').notNull(),
    /** disposition (a status decision) | cost (landed-cost record) — the UI lists them separately. */
    kind: text('kind').notNull().default('disposition'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    lotIdx: index('lot_status_events_lot_idx').on(table.lotId),
  }),
);

export type LotStatusEvent = typeof lotStatusEvents.$inferSelect;

/**
 * Analytical documents attached to a lot, one row per upload. The lot row's
 * `coaKey` / `chromatogramKey` / `massSpecKey` / `sdsKey` point at the row
 * currently in force; earlier uploads are marked superseded and stay in R2,
 * so a replaced certificate can still be produced on request.
 */
export const lotDocuments = sqliteTable(
  'lot_documents',
  {
    id: text('id').primaryKey(),
    lotId: text('lot_id').notNull(),
    /** coa | chromatogram | mass_spec | sds */
    documentType: text('document_type').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    originalName: text('original_name'),
    uploadedBy: text('uploaded_by').notNull(),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
    supersededAt: integer('superseded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    lotIdx: index('lot_documents_lot_idx').on(table.lotId),
    keyIdx: uniqueIndex('lot_documents_key_idx').on(table.objectKey),
  }),
);

export type LotDocument = typeof lotDocuments.$inferSelect;

/**
 * Movement ledger. Append-only.
 *
 * A complete, current record of each substance received, shipped, returned or
 * destroyed, with the named consignee on every movement — modelled on
 * 21 CFR 1304.21, which is the only articulated federal standard for this and
 * is what an inspector, an underwriter and an acquiring bank each measure you
 * against. Recorded dates are ACTUAL receipt and shipment dates, not order
 * dates. This table is never exposed publicly.
 */
export const lotMovements = sqliteTable(
  'lot_movements',
  {
    id: text('id').primaryKey(),
    lotId: text('lot_id').notNull(),
    /** receipt | shipment | return | destruction | adjustment | sample */
    movementType: text('movement_type').notNull(),
    /** increase | decrease. Legacy receipt/return are increases; shipment is a decrease. */
    direction: text('direction'),
    quantity: text('quantity').notNull(),

    accountId: text('account_id'),
    consigneeName: text('consignee_name'),
    consigneeInstitution: text('consignee_institution'),
    shipToAddress: text('ship_to_address'),
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),

    /** Destruction requires two witnesses, per 21 CFR 1304.21(e) practice. */
    witnessOne: text('witness_one'),
    witnessTwo: text('witness_two'),

    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    recordedBy: text('recorded_by').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    lotIdx: index('lot_movements_lot_idx').on(table.lotId),
    accountIdx: index('lot_movements_account_idx').on(table.accountId),
    occurredIdx: index('lot_movements_occurred_idx').on(table.occurredAt),
  }),
);

/**
 * Catalog. One row per material, classified by CHEMICAL CLASS only — never by
 * indication, research area or physiological process (CLAUDE.md rule 2).
 *
 * There is deliberately no column for dose, route, reconstitution volume,
 * efficacy or indication. The catalog manager form cannot collect what the
 * schema cannot store. Solubility, related CAS numbers, pack sizes and source
 * notes are stored as JSON arrays and validated in lib/catalog-rules.ts before
 * any write.
 *
 * Products are never deleted: `visibility` moves to 'withdrawn' with a reason,
 * so lot records that reference the product code stay readable.
 */
export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    formalName: text('formal_name').notNull(),
    synonyms: text('synonyms', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    chemicalClass: text('chemical_class').notNull(),

    // Chemical identity
    casNumber: text('cas_number').notNull(),
    relatedCas: text('related_cas', { mode: 'json' })
      .$type<{ form: string; cas: string }[]>()
      .notNull()
      .default([]),
    sequenceOneLetter: text('sequence_one_letter'),
    sequenceThreeLetter: text('sequence_three_letter'),
    molecularFormula: text('molecular_formula').notNull(),
    molecularWeight: text('molecular_weight').notNull(),
    exactMass: text('exact_mass'),
    smiles: text('smiles'),
    inchiKey: text('inchi_key'),
    pubchemCid: text('pubchem_cid'),

    // Specification and handling
    purity: text('purity').notNull(),
    form: text('form').notNull(),
    saltForm: text('salt_form').notNull(),
    /** Laboratory solvents only. Each entry carries its own source. */
    solubility: text('solubility', { mode: 'json' })
      .$type<
        {
          solvent: string;
          concentration: string;
          note?: string;
          source: string;
        }[]
      >()
      .notNull()
      .default([]),
    storageSolid: text('storage_solid').notNull(),
    storageStock: text('storage_stock').notNull(),
    stability: text('stability').notNull(),
    shipping: text('shipping').notNull(),

    /** available | limited | enquire */
    status: text('status').notNull().default('enquire'),
    description: text('description').notNull(),
    /** Provenance for every published figure. Required, never empty. */
    sourceNotes: text('source_notes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    /**
     * GHS hazard classification, for container labels and the hazard
     * communication programme.
     *
     * Null means nobody has classified this material yet, which is not the
     * same as "not hazardous" — that is recorded as a signal word of `none`
     * with a source, so the absence of a hazard is a decision somebody made
     * rather than a field nobody filled in. `dissent` carries a supplier
     * disagreement verbatim; classifications are never silently reconciled.
     */
    hazard: text('hazard', { mode: 'json' }).$type<{
      signalWord: 'danger' | 'warning' | 'none';
      /** GHS01..GHS09. */
      pictograms: string[];
      hazardStatements: { code: string; text: string }[];
      precautionaryStatements: { code: string; text: string }[];
      /** Hazard class and category, e.g. 'Skin irritation, Category 2'. */
      classification: string[];
      /** Where the classification came from. Required. */
      source: string;
      /** A supplier that classifies it differently, recorded not resolved. */
      dissent: string | null;
      reviewedBy: string;
      /** ISO date. */
      reviewedAt: string;
    } | null>(),
    hasSds: integer('has_sds', { mode: 'boolean' }).notNull().default(false),
    /** Path under /public, or null where no photograph of this material exists. */
    image: text('image'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),

    /** draft | published | withdrawn */
    visibility: text('visibility').notNull().default('draft'),
    withdrawnReason: text('withdrawn_reason'),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedBy: text('updated_by'),
  },
  (table) => ({
    codeIdx: uniqueIndex('products_code_idx').on(table.code),
    slugIdx: uniqueIndex('products_slug_idx').on(table.slug),
    classIdx: index('products_class_idx').on(table.chemicalClass),
    visibilityIdx: index('products_visibility_idx').on(table.visibility),
  }),
);

/**
 * Pack sizes. One row per orderable presentation of a product, so an order
 * line and a lot movement can reference a stable SKU rather than a free-text
 * quantity. `sku` is derived deterministically by `skuFor()` in
 * lib/catalog-rules.ts (NPL-001 + "5 mg" → NPL-001-5MG). `presentation` is
 * restricted to the PRESENTATIONS whitelist in the same module (vial of solid,
 * etc.); there is no capsule, spray or pre-filled format because those
 * describe a product for administration, not a reagent.
 *
 * Prices are in integer cents and null until set. Which price a visitor sees
 * is decided by account tier (Phase 4), never by the page.
 */
export const productVariants = sqliteTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),
    sku: text('sku').notNull(),
    quantity: text('quantity').notNull(),
    presentation: text('presentation').notNull(),
    listPriceCents: integer('list_price_cents'),
    institutionalPriceCents: integer('institutional_price_cents'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    skuIdx: uniqueIndex('product_variants_sku_idx').on(table.sku),
    productIdx: index('product_variants_product_idx').on(table.productId),
  }),
);

/**
 * Catalog history. Every create or update writes the full product (with its
 * variants) as a JSON snapshot here, attributed to the staff member. This
 * answers "what did the product page say on that date" without diffing
 * deploys, and it is what makes a withdrawal auditable.
 */
export const productRevisions = sqliteTable(
  'product_revisions',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),
    productCode: text('product_code').notNull(),
    /** create | update | withdraw | restore */
    action: text('action').notNull(),
    snapshot: text('snapshot', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    changedBy: text('changed_by').notNull(),
    changedByName: text('changed_by_name').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    productIdx: index('product_revisions_product_idx').on(table.productId),
  }),
);

export type ProductRevision = typeof productRevisions.$inferSelect;

/**
 * Chemical classes — the only classification axis (CLAUDE.md rule 2), held as
 * data so staff manage them in the catalog manager. `id` is the URL anchor;
 * `name` is what products store in `chemical_class`. Never deleted; a class
 * with no products can be made inactive.
 */
export const chemicalClasses = sqliteTable('chemical_classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** Describes the chemistry of the class. Never what a compound does in an organism. */
  blurb: text('blurb').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  /** Fresh id stamped by every change; dependent rows are written only where it matches. */
  lastChangeId: text('last_change_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedBy: text('updated_by'),
});

export const chemicalClassRevisions = sqliteTable(
  'chemical_class_revisions',
  {
    id: text('id').primaryKey(),
    classId: text('class_id').notNull(),
    /** create | update | deactivate | reactivate */
    action: text('action').notNull(),
    snapshot: text('snapshot', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    changedBy: text('changed_by').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    classIdx: index('chemical_class_revisions_class_idx').on(table.classId),
  }),
);

export type ChemicalClassRow = typeof chemicalClasses.$inferSelect;

/**
 * Staff. The people who can edit the catalog, receive lots, and release them.
 * Every release, hold and catalog edit is attributed to a row here by name.
 *
 * Passwords are PBKDF2-SHA256 hashes (lib/staff-auth.ts). Accounts are never
 * deleted; `active` is set false. Repeated failed sign-ins lock the account
 * for a period rather than allowing unlimited guesses.
 */
export const staffUsers = sqliteTable(
  'staff_users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** admin | qc | ops */
    role: text('role').notNull().default('ops'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    /** Set on creation and on an admin reset; cleared when the person sets their own password. */
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    passwordChangedAt: integer('password_changed_at', { mode: 'timestamp' }),
    createdBy: text('created_by'),
    /** Fresh id stamped by every admin change; the event row is written only where it matches. */
    lastChangeId: text('last_change_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    emailIdx: uniqueIndex('staff_users_email_idx').on(table.email),
  }),
);

/** Server-side sessions. The cookie carries a random token; only its SHA-256 is stored. */
/**
 * Staff account history: who created, changed, reset or deactivated whom, and
 * every sign-in attempt. Append-only.
 */
export const staffEvents = sqliteTable(
  'staff_events',
  {
    id: text('id').primaryKey(),
    /** The staff user the event is about. */
    userId: text('user_id').notNull(),
    /** create | role | deactivate | reactivate | password_reset | password_changed | sessions_revoked | sign_in | sign_in_failed | locked */
    action: text('action').notNull(),
    detail: text('detail'),
    /** "Name (stf_id)" of the actor, or "self" / "system". */
    actor: text('actor').notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index('staff_events_user_idx').on(table.userId),
  }),
);

export type StaffEvent = typeof staffEvents.$inferSelect;

export const staffSessions = sqliteTable(
  'staff_sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tokenIdx: uniqueIndex('staff_sessions_token_idx').on(table.tokenHash),
    userIdx: index('staff_sessions_user_idx').on(table.userId),
  }),
);

/**
 * Customer accounts. One row per person; the organisation and its
 * verification live in `organizations` (Phase 4.3). `tier` decides what the
 * account can see: 'institutional' after verification, 'consumer' only if the
 * consumer tier is enabled by the owner (CONSUMER_TIER_ENABLED). The site
 * ships institutional-only.
 *
 * Every acknowledgement is recorded with the time and the document version
 * the person saw, so the record shows what was agreed to, not just that
 * something was.
 */
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** consumer | institutional */
    tier: text('tier').notNull().default('institutional'),
    /** pending_email | active | suspended */
    status: text('status').notNull().default('pending_email'),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
    termsAcceptedAt: integer('terms_accepted_at', { mode: 'timestamp' }),
    termsVersion: text('terms_version'),
    ruoAcceptedAt: integer('ruo_accepted_at', { mode: 'timestamp' }),
    ruoVersion: text('ruo_version'),
    /** none | submitted | approved | declined | more_info | revoked — mirrors organizations.verificationStatus */
    verificationStatus: text('verification_status').notNull().default('none'),
    /** Fresh id stamped by every staff service change; the event row is written only where it matches. */
    lastChangeId: text('last_change_id'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    emailIdx: uniqueIndex('accounts_email_idx').on(table.email),
    statusIdx: index('accounts_status_idx').on(table.status),
  }),
);

/**
 * Customer account history: password resets, suspensions, staff-triggered
 * emails, session revocations. Append-only; the actor is 'self', 'system' or
 * "Name (stf_id)".
 */
export const accountEvents = sqliteTable(
  'account_events',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    /** password_reset_requested | password_reset | suspended | reinstated | verification_resent | sessions_revoked | reset_sent */
    action: text('action').notNull(),
    detail: text('detail'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    accountIdx: index('account_events_account_idx').on(table.accountId),
  }),
);

export type AccountEvent = typeof accountEvents.$inferSelect;

/**
 * Fixed-window counters for unauthenticated endpoints that send mail
 * (password reset, sign-up). One row per key; the window rolls forward in the
 * upsert itself so the check is a single atomic statement.
 */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull().default(0),
});

export const accountSessions = sqliteTable(
  'account_sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    accountId: text('account_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tokenIdx: uniqueIndex('account_sessions_token_idx').on(table.tokenHash),
    accountIdx: index('account_sessions_account_idx').on(table.accountId),
  }),
);

/** Single-use, expiring tokens for email verification and password reset. Only the hash is stored. */
export const emailTokens = sqliteTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    /** verify_email | reset_password */
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tokenIdx: uniqueIndex('email_tokens_token_idx').on(table.tokenHash),
    accountIdx: index('email_tokens_account_idx').on(table.accountId),
  }),
);

/**
 * Acceptance history. Append-only: one row per document per acceptance, so
 * the record shows every version an account ever agreed to and when. The
 * scalar columns on `accounts` are only a cache of the latest row.
 */
export const accountAcknowledgements = sqliteTable(
  'account_acknowledgements',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    /** terms | ruo */
    document: text('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }).notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    accountIdx: index('account_acknowledgements_account_idx').on(
      table.accountId,
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type StaffSession = typeof staffSessions.$inferSelect;
/**
 * Product-level documents — today the safety data sheet. One row per upload;
 * the current SDS is the latest row not superseded. Public download for
 * published products: an SDS is safety documentation, not a claim, and OSHA
 * hazard communication expects it to travel with the material.
 */
export const productDocuments = sqliteTable(
  'product_documents',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull(),
    /** sds */
    kind: text('kind').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    originalName: text('original_name'),
    /** Revision label as printed on the sheet, e.g. "Rev 2, 2026-08-14". */
    revision: text('revision'),
    uploadedBy: text('uploaded_by').notNull(),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
    supersededAt: integer('superseded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    productIdx: index('product_documents_product_idx').on(table.productId),
    keyIdx: uniqueIndex('product_documents_key_idx').on(table.objectKey),
  }),
);

export type ProductDocument = typeof productDocuments.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type LotTest = typeof lotTests.$inferSelect;
export type LotMovement = typeof lotMovements.$inferSelect;

/**
 * Organisation verification. One organisation per account. The account's
 * `verificationStatus` mirrors `verificationStatus` here so pages can gate
 * without a join. Decisions are appended to `verification_events`.
 *
 * Verification is what makes "institutional accounts only" substantive
 * rather than a checkbox: a person reviews the organisation, its domain, its
 * shipping address and its documents before pricing is shown.
 */
export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    legalName: text('legal_name').notNull(),
    website: text('website').notNull(),
    emailDomain: text('email_domain').notNull(),
    /** university | hospital | cro | analytical_lab | company | government | other */
    organizationType: text('organization_type').notNull(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull(),
    region: text('region').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull(),
    phone: text('phone'),
    registrationNumber: text('registration_number'),
    researchContext: text('research_context').notNull(),
    receivingParty: text('receiving_party').notNull(),
    /** Automatic checks that did not pass outright, for the reviewer. JSON array of strings. */
    reviewFlags: text('review_flags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    /** submitted | approved | declined | more_info */
    verificationStatus: text('verification_status')
      .notNull()
      .default('submitted'),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewNote: text('review_note'),
    /** Id of the decision that produced the current status; lets the event insert be conditional on it. */
    lastDecisionId: text('last_decision_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    accountIdx: uniqueIndex('organizations_account_idx').on(table.accountId),
    statusIdx: index('organizations_status_idx').on(table.verificationStatus),
  }),
);

export const organizationDocuments = sqliteTable(
  'organization_documents',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    /** registration | letterhead | other */
    kind: text('kind').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    originalName: text('original_name'),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    orgIdx: index('organization_documents_org_idx').on(table.organizationId),
    keyIdx: uniqueIndex('organization_documents_key_idx').on(table.objectKey),
  }),
);

/** Append-only verification decisions, with the named staff member and note. */
export const verificationEvents = sqliteTable(
  'verification_events',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    decidedBy: text('decided_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    orgIdx: index('verification_events_org_idx').on(table.organizationId),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationDocument = typeof organizationDocuments.$inferSelect;
export type VerificationEvent = typeof verificationEvents.$inferSelect;

/**
 * Cart. Server-side, per account, so a price is never trusted from the
 * browser: the line is a variant reference and a quantity, nothing more.
 */
export const cartItems = sqliteTable(
  'cart_items',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    variantId: text('variant_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    accountVariantIdx: uniqueIndex('cart_items_account_variant_idx').on(
      table.accountId,
      table.variantId,
    ),
  }),
);

/**
 * Orders.
 *
 * `channel` and `authorizationRef` exist from the first order even though
 * today every order is 'research_direct' and the reference is always null:
 * a future prescribing model is an authorisation layer between the order and
 * fulfilment, and the order model must not assume authorisation is automatic.
 *
 * Prices, the ship-to address and the consignee are snapshotted at
 * submission. Status only moves through lib/orders.ts and every move is an
 * `order_events` row. Nothing is deleted; a cancelled order stays.
 */
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(),
    accountId: text('account_id').notNull(),
    /** Checkout contact, not a verified identity or a login credential. */
    contactEmail: text('contact_email'),
    organizationId: text('organization_id'),
    /** research_direct | (future) prescribed */
    channel: text('channel').notNull().default('research_direct'),
    authorizationRef: text('authorization_ref'),
    /** submitted | awaiting_payment | paid | fulfilling | shipped | cancelled */
    status: text('status').notNull().default('submitted'),
    currency: text('currency').notNull().default('USD'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    /** Checkout rate accepted by the customer; copied from a server-owned quote. */
    shippingQuoteId: text('shipping_quote_id'),
    shippingRateId: text('shipping_rate_id'),
    shippingService: text('shipping_service'),
    /** Tier the prices were taken from: institutional | consumer */
    priceTier: text('price_tier').notNull(),
    // Ship-to snapshot
    consigneeName: text('consignee_name').notNull(),
    consigneeInstitution: text('consignee_institution'),
    shipToLine1: text('ship_to_line1').notNull(),
    shipToLine2: text('ship_to_line2'),
    shipToCity: text('ship_to_city').notNull(),
    shipToRegion: text('ship_to_region').notNull(),
    shipToPostalCode: text('ship_to_postal_code').notNull(),
    shipToCountry: text('ship_to_country').notNull(),
    shipToPhone: text('ship_to_phone'),
    // Payment (Phase 5.2)
    paymentMethod: text('payment_method'),
    paymentRef: text('payment_ref'),
    /** unpaid | pending | paid | failed | refund_due | refunded — 'refunded' only once money has actually moved */
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    // Shipment (Phase 5.3)
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    customerNote: text('customer_note'),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull(),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    shippedAt: integer('shipped_at', { mode: 'timestamp' }),
    /** Carrier or staff-confirmed delivery date and the supporting reference. */
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    deliveryEvidence: text('delivery_evidence'),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    cancelReason: text('cancel_reason'),
    /** What is owed back: the order total on a cancelled paid order, the value of the returned lines on a return. */
    refundDueCents: integer('refund_due_cents'),
    /** Refund actually made (cumulative), latest reference, first refund date. paymentStatus becomes 'refunded' once the due amount is fully sent. */
    refundCents: integer('refund_cents'),
    refundRef: text('refund_ref'),
    refundedAt: integer('refunded_at', { mode: 'timestamp' }),
    /** When returned material was received back (ledger has the movement). */
    returnedAt: integer('returned_at', { mode: 'timestamp' }),
    /** Current internal owner and target for the next service action. */
    assignedTo: text('assigned_to'),
    assignedName: text('assigned_name'),
    serviceDueAt: integer('service_due_at', { mode: 'timestamp' }),
    /** Id of the transition that produced the current status; guards the event row. */
    lastTransitionId: text('last_transition_id'),
    /** Random token from the rendered cart form; unique, so a double submit cannot create two orders. */
    submissionToken: text('submission_token'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    numberIdx: uniqueIndex('orders_number_idx').on(table.orderNumber),
    tokenIdx: uniqueIndex('orders_submission_token_idx').on(
      table.submissionToken,
    ),
    accountIdx: index('orders_account_idx').on(table.accountId),
    statusIdx: index('orders_status_idx').on(table.status),
    assignedIdx: index('orders_assigned_idx').on(table.assignedTo),
    serviceDueIdx: index('orders_service_due_idx').on(table.serviceDueAt),
  }),
);

export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    productId: text('product_id').notNull(),
    productCode: text('product_code').notNull(),
    productName: text('product_name').notNull(),
    variantId: text('variant_id').notNull(),
    sku: text('sku').notNull(),
    packSize: text('pack_size').notNull(),
    presentation: text('presentation').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    /** Assigned at fulfilment from a RELEASED lot. */
    lotId: text('lot_id'),
    /** Packs received back on this line (written by the return batch; null until a return). */
    returnedPacks: integer('returned_packs'),
    lotNumber: text('lot_number'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    orderIdx: index('order_items_order_idx').on(table.orderId),
  }),
);

/** Append-only order history with the actor (account or staff) and a note. */
export const orderEvents = sqliteTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    orderIdx: index('order_events_order_idx').on(table.orderId),
  }),
);

export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;

/* ------------------------------------------------------------------------ */
/* Procurement                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Suppliers. Qualification is a named decision ("know your supplier"): a
 * purchase order can only be raised on a qualified supplier. Never deleted.
 */
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    country: text('country'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    phone: text('phone'),
    website: text('website'),
    notes: text('notes'),
    /** unqualified | qualified | suspended */
    qualificationStatus: text('qualification_status')
      .notNull()
      .default('unqualified'),
    qualifiedBy: text('qualified_by'),
    qualifiedAt: integer('qualified_at', { mode: 'timestamp' }),
    /** What products/services the qualification decision covers. */
    qualificationScope: text('qualification_scope'),
    /** Controlled evidence folder or record reviewed for the decision. */
    qualificationEvidenceUrl: text('qualification_evidence_url'),
    /** Date the named qualification must be reviewed again. */
    qualificationReviewDueOn: integer('qualification_review_due_on', {
      mode: 'timestamp',
    }),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastChangeId: text('last_change_id'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    nameIdx: uniqueIndex('suppliers_name_idx').on(table.name),
  }),
);

export const supplierEvents = sqliteTable(
  'supplier_events',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').notNull(),
    /** create | update | qualify | suspend | requalify */
    action: text('action').notNull(),
    detail: text('detail'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    supplierIdx: index('supplier_events_supplier_idx').on(table.supplierId),
  }),
);

/** Purchase orders: what was ordered, from whom, at what cost, and what has arrived against it. */
export const purchaseOrders = sqliteTable(
  'purchase_orders',
  {
    id: text('id').primaryKey(),
    poNumber: text('po_number').notNull(),
    supplierId: text('supplier_id').notNull(),
    supplierName: text('supplier_name').notNull(),
    /** draft | sent | partially_received | received | cancelled */
    status: text('status').notNull().default('draft'),
    orderedOn: integer('ordered_on', { mode: 'timestamp' }),
    expectedOn: integer('expected_on', { mode: 'timestamp' }),
    /** Freight and duty for the whole order, allocated to lines by line cost when a lot is received. */
    freightCents: integer('freight_cents').notNull().default(0),
    dutyCents: integer('duty_cents').notNull().default(0),
    supplierReference: text('supplier_reference'),
    note: text('note'),
    lastTransitionId: text('last_transition_id'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    numberIdx: uniqueIndex('purchase_orders_number_idx').on(table.poNumber),
    supplierIdx: index('purchase_orders_supplier_idx').on(table.supplierId),
    statusIdx: index('purchase_orders_status_idx').on(table.status),
  }),
);

export const purchaseOrderLines = sqliteTable(
  'purchase_order_lines',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id').notNull(),
    lineNo: integer('line_no').notNull(),
    productCode: text('product_code').notNull(),
    productName: text('product_name').notNull(),
    /** Ordered quantity with unit, e.g. "25 g". */
    quantity: text('quantity').notNull(),
    /** Material cost for the whole line, before freight and duty. */
    lineCostCents: integer('line_cost_cents').notNull(),
    /** Sum of quantities received against this line so far. */
    receivedQuantity: text('received_quantity'),
    receivedCount: integer('received_count').notNull().default(0),
    /** Lot id stamped by the receipt that last updated this line; the lot row is inserted only where it matches. */
    lastReceiptLotId: text('last_receipt_lot_id'),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    poIdx: index('purchase_order_lines_po_idx').on(table.purchaseOrderId),
    productIdx: index('purchase_order_lines_product_idx').on(table.productCode),
  }),
);

export const purchaseOrderEvents = sqliteTable(
  'purchase_order_events',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchase_order_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    poIdx: index('purchase_order_events_po_idx').on(table.purchaseOrderId),
  }),
);

export type Supplier = typeof suppliers.$inferSelect;
export type SupplierEvent = typeof supplierEvents.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type PurchaseOrderEvent = typeof purchaseOrderEvents.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Issued documents (Phase 8)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A document this business has issued: a certificate of analysis, an invoice,
 * a packing slip, a container label.
 *
 * An issued document is a record, not a rendering. The bytes are written to
 * R2 once and never regenerated, because a certificate produced today from a
 * lot row that has since been corrected would not be the certificate the
 * customer holds. `sha256` is the hash of the bytes as issued, so a document
 * produced in a dispute can be checked against what left here.
 *
 * Corrections follow the lot pattern: issue a new document, point the old one
 * at it through `supersededById`, delete nothing.
 */
export const issuedDocuments = sqliteTable(
  'issued_documents',
  {
    id: text('id').primaryKey(),
    /** coa | invoice | packing_slip | hazcom */
    kind: text('kind').notNull(),
    /** lot | order | product | facility */
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    /** Printed on the document. Unique for all time — an invoice number is never reused. */
    documentNumber: text('document_number').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull().default('application/pdf'),
    sizeBytes: integer('size_bytes').notNull(),
    /** Lowercase hex SHA-256 of the issued bytes. */
    sha256: text('sha256').notNull(),
    issuedBy: text('issued_by').notNull(),
    issuedAt: integer('issued_at', { mode: 'timestamp' }).notNull(),
    supersededById: text('superseded_by_id'),
    supersededAt: integer('superseded_at', { mode: 'timestamp' }),
    supersedeReason: text('supersede_reason'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    subjectIdx: index('issued_documents_subject_idx').on(
      table.subjectType,
      table.subjectId,
    ),
    kindIdx: index('issued_documents_kind_idx').on(table.kind),
    numberIdx: uniqueIndex('issued_documents_number_idx').on(
      table.documentNumber,
    ),
    keyIdx: uniqueIndex('issued_documents_key_idx').on(table.objectKey),
  }),
);

/**
 * Monotonic counters behind document numbers, one row per series
 * (`invoice:2026`, `coa:STG-001`). Claimed with a single
 * `UPDATE … SET next_value = next_value + 1 … RETURNING`, which D1 executes
 * atomically, so two staff issuing at once cannot take the same number.
 */
export const documentSequences = sqliteTable('document_sequences', {
  key: text('key').primaryKey(),
  nextValue: integer('next_value').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type IssuedDocument = typeof issuedDocuments.$inferSelect;
export type DocumentSequence = typeof documentSequences.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Operating settings (Phase 8.5)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Facts about the operation that documents need and code must not invent:
 * the registered address and telephone that a GHS label has to carry, who is
 * responsible for the hazard communication programme, where material is
 * handled, how staff reach a safety data sheet.
 *
 * These live in the database rather than in `lib/entity.ts` because they are
 * the owner's to set and change without a deploy — the same reason the
 * catalog is data. Every change is attributed.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Setting = typeof settings.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Operating controls                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The current owner/evidence state of a business operating control.
 *
 * Definitions (title, area and whether a control blocks launch) live in code
 * so a deploy can add or clarify a control without silently marking it done.
 * This table contains only facts recorded by staff. Missing rows therefore
 * mean "not started", never "not applicable" or "ready".
 */
export const operationalControls = sqliteTable(
  'operational_controls',
  {
    key: text('key').primaryKey(),
    /** not_started | in_progress | blocked | awaiting_review | ready | not_applicable */
    status: text('status').notNull().default('not_started'),
    ownerId: text('owner_id'),
    ownerName: text('owner_name'),
    dueOn: integer('due_on', { mode: 'timestamp' }),
    evidenceUrl: text('evidence_url'),
    note: text('note'),
    lastChangeId: text('last_change_id'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    statusIdx: index('operational_controls_status_idx').on(table.status),
    ownerIdx: index('operational_controls_owner_idx').on(table.ownerId),
    dueIdx: index('operational_controls_due_idx').on(table.dueOn),
  }),
);

/** Append-only history for every control update. */
export const operationalControlEvents = sqliteTable(
  'operational_control_events',
  {
    id: text('id').primaryKey(),
    controlKey: text('control_key').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    ownerId: text('owner_id'),
    ownerName: text('owner_name'),
    dueOn: integer('due_on', { mode: 'timestamp' }),
    evidenceUrl: text('evidence_url'),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    controlIdx: index('operational_control_events_control_idx').on(
      table.controlKey,
      table.createdAt,
    ),
  }),
);

export type OperationalControl = typeof operationalControls.$inferSelect;
export type OperationalControlEvent =
  typeof operationalControlEvents.$inferSelect;

/* -------------------------------------------------------------------------- */
/* Operational cases                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One accountable record for an operational exception. The current row is a
 * working summary; every mutation is also written to operational_case_events.
 */
export const operationalCases = sqliteTable(
  'operational_cases',
  {
    id: text('id').primaryKey(),
    caseNumber: text('case_number').notNull(),
    /** complaint | deviation | supplier_issue | incident | capa | recall */
    type: text('type').notNull(),
    /** low | medium | high | critical */
    severity: text('severity').notNull(),
    /** open | contained | investigating | action_required | effectiveness_review | closed */
    status: text('status').notNull().default('open'),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    ownerId: text('owner_id').notNull(),
    ownerName: text('owner_name').notNull(),
    dueOn: integer('due_on', { mode: 'timestamp' }).notNull(),
    linkedLotNumber: text('linked_lot_number'),
    linkedOrderNumber: text('linked_order_number'),
    linkedSupplierId: text('linked_supplier_id'),
    containment: text('containment'),
    rootCause: text('root_cause'),
    correctiveAction: text('corrective_action'),
    preventiveAction: text('preventive_action'),
    evidenceUrl: text('evidence_url'),
    effectivenessCheck: text('effectiveness_check'),
    closureSummary: text('closure_summary'),
    createdBy: text('created_by').notNull(),
    lastChangeId: text('last_change_id').notNull(),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    numberIdx: uniqueIndex('operational_cases_number_idx').on(table.caseNumber),
    statusIdx: index('operational_cases_status_idx').on(table.status),
    ownerIdx: index('operational_cases_owner_idx').on(table.ownerId),
    dueIdx: index('operational_cases_due_idx').on(table.dueOn),
    lotIdx: index('operational_cases_lot_idx').on(table.linkedLotNumber),
    orderIdx: index('operational_cases_order_idx').on(table.linkedOrderNumber),
  }),
);

/** Append-only snapshots of every case creation, update, handoff and closure. */
export const operationalCaseEvents = sqliteTable(
  'operational_case_events',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    ownerId: text('owner_id').notNull(),
    ownerName: text('owner_name').notNull(),
    action: text('action').notNull(),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    caseIdx: index('operational_case_events_case_idx').on(
      table.caseId,
      table.createdAt,
    ),
  }),
);

export type OperationalCase = typeof operationalCases.$inferSelect;
export type OperationalCaseEvent = typeof operationalCaseEvents.$inferSelect;
