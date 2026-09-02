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

export type Lot = typeof lots.$inferSelect;
export type LotTest = typeof lotTests.$inferSelect;
export type LotMovement = typeof lotMovements.$inferSelect;
