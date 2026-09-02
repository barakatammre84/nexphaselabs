import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    identityConfirmed: integer('identity_confirmed', { mode: 'boolean' }).notNull().default(false),
    identityMethod: text('identity_method'),
    waterContent: text('water_content'),
    heavyMetalsSummary: text('heavy_metals_summary'),

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
    storageLocation: text('storage_location'),
    storageCondition: text('storage_condition'),
    retestDate: integer('retest_date', { mode: 'timestamp' }),

    supersededById: text('superseded_by_id'),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    lotNumberIdx: uniqueIndex('lots_lot_number_idx').on(table.lotNumber),
    productIdx: index('lots_product_idx').on(table.productCode),
    statusIdx: index('lots_status_idx').on(table.status),
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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    lotIdx: index('lot_tests_lot_idx').on(table.lotId),
  }),
);

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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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
    synonyms: text('synonyms', { mode: 'json' }).$type<string[]>().notNull().default([]),
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
      .$type<{ solvent: string; concentration: string; note?: string; source: string }[]>()
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
    sourceNotes: text('source_notes', { mode: 'json' }).$type<string[]>().notNull().default([]),
    hasSds: integer('has_sds', { mode: 'boolean' }).notNull().default(false),
    /** Path under /public, or null where no photograph of this material exists. */
    image: text('image'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),

    /** draft | published | withdrawn */
    visibility: text('visibility').notNull().default('draft'),
    withdrawnReason: text('withdrawn_reason'),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    skuIdx: uniqueIndex('product_variants_sku_idx').on(table.sku),
    productIdx: index('product_variants_product_idx').on(table.productId),
  }),
);

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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    emailIdx: uniqueIndex('staff_users_email_idx').on(table.email),
  }),
);

/** Server-side sessions. The cookie carries a random token; only its SHA-256 is stored. */
export const staffSessions = sqliteTable(
  'staff_sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    tokenIdx: uniqueIndex('staff_sessions_token_idx').on(table.tokenHash),
    userIdx: index('staff_sessions_user_idx').on(table.userId),
  }),
);

export type StaffUser = typeof staffUsers.$inferSelect;
export type StaffSession = typeof staffSessions.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type LotTest = typeof lotTests.$inferSelect;
export type LotMovement = typeof lotMovements.$inferSelect;
