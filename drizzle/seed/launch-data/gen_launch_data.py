import hashlib, json, sys, time
MODE = sys.argv[1] if len(sys.argv) > 1 else 'staging'   # staging | production
ACTOR = "Launch pass 2026-09-12 (Claude for Ammre, under owner authority; not a staff login)"
NOW = int(time.time())
def q(s):
    return 'NULL' if s is None else "'" + str(s).replace("'", "''") + "'"
def hid(prefix, seed, n=24):
    return f"{prefix}_{hashlib.sha256(seed.encode()).hexdigest()[:n]}"
def ts(d):  # 'YYYY-MM-DD' -> unix midnight UTC
    import datetime; return int(datetime.datetime.strptime(d, '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc).timestamp())

out = [f"-- NexPhase launch data ({MODE}), generated 2026-09-12. Idempotent where possible (INSERT OR IGNORE / guarded UPDATE).",
       "-- Source of every price and quantity: owner inventory list supplied 12 Sep 2026. Source of every test result: ILS Laboratories certificates (files.ils-lab.com).",
       "-- Nothing here invents a manufacturer. Production lots stay in quarantine until the manufacturer is recorded and a named person releases them."]

# ---------- 1. Withdraw the synthetic staging lot ----------
if MODE == 'staging':
    ev = hid('evt', 'withdraw-STG-001')
    reason = ("Withdrawn 2026-09-12: synthetic staging record. Manufacturer name/address were placeholder text (\"Example Peptide Manufacturing Co.\"), "
              "no testing laboratory, accession number or testing standard were recorded, and the record was publicly resolvable. Not a real lot; nothing shipped to a customer.")
    out += [
      f"UPDATE lots SET status='withdrawn', status_reason={q(reason)}, updated_at={NOW} WHERE lot_number='STG-001' AND status='released' AND superseded_by_id IS NULL;",
      f"INSERT OR IGNORE INTO lot_status_events (id, lot_id, from_status, to_status, reason, decided_by, kind, created_at) "
      f"SELECT {q(ev)}, id, 'released', 'withdrawn', {q(reason)}, {q(ACTOR)}, 'disposition', {NOW} FROM lots WHERE lot_number='STG-001' AND status='withdrawn';",
    ]

# ---------- 2. Catalog ----------
# 2a. GHK-Cu: the real pack is a 50 mg vial. Price from the owner list ($29). Institutional price = list until Wisam sets one.
out += [
  "INSERT OR IGNORE INTO product_variants (id, product_id, sku, quantity, presentation, list_price_cents, institutional_price_cents, active, sort_order, created_at, updated_at) "
  f"VALUES ('var_npl00450mg', 'prd_npl004', 'NPL-004-50MG', '50 mg', 'Lyophilised solid, sealed 3 mL vial', 2900, 2900, 1, 5, {NOW}, {NOW});",
  # packs that do not physically exist are switched off, never deleted (order lines reference variants)
  f"UPDATE product_variants SET active=0, updated_at={NOW} WHERE product_id='prd_npl004' AND sku IN ('NPL-004-5MG','NPL-004-25MG','NPL-004-100MG') AND active=1;",
  # 2b. Products with no stock and no owner-approved price: enquire only; the seeded BPC-157 prices were never approved by an owner.
  f"UPDATE product_variants SET list_price_cents=NULL, institutional_price_cents=NULL, updated_at={NOW} WHERE product_id='prd_npl001' AND list_price_cents IS NOT NULL;",
  f"UPDATE products SET status='enquire', updated_at={NOW}, updated_by={q(ACTOR)} WHERE code IN ('NPL-001','NPL-002','NPL-003','NPL-005') AND status<>'enquire';",
  f"UPDATE products SET status='available', featured=1, updated_at={NOW}, updated_by={q(ACTOR)} WHERE code='NPL-004' AND (status<>'available' OR featured=0);",
]
# 2c. Draft records for the two compounds held for counsel. Real names; codenames are prohibited (CLAUDE.md).
def product(pid, code, slug, name, formal, synonyms, cas, formula, mw, exact, inchikey, cid, description, source_notes, sort):
    return ("INSERT OR IGNORE INTO products (id, code, slug, name, formal_name, synonyms, chemical_class, cas_number, related_cas, sequence_one_letter, sequence_three_letter, "
            "molecular_formula, molecular_weight, exact_mass, smiles, inchi_key, pubchem_cid, purity, form, salt_form, solubility, storage_solid, storage_stock, stability, shipping, "
            "status, description, source_notes, has_sds, image, featured, visibility, withdrawn_reason, sort_order, created_at, updated_at, updated_by, hazard) VALUES ("
            f"{q(pid)}, {q(code)}, {q(slug)}, {q(name)}, {q(formal)}, {q(json.dumps(synonyms))}, 'Peptides', {q(cas)}, '[]', NULL, NULL, {q(formula)}, {q(mw)}, {q(exact)}, NULL, {q(inchikey)}, {q(cid)}, "
            "'Refer to the lot certificate (ILS Full QC Panel, HPLC)', 'Lyophilised solid', 'Refer to the lot certificate', '[]', 'Minus 20 C', 'Refer to the lot certificate', 'Refer to the lot certificate', 'Ambient', "
            f"'available', {q(description)}, {q(json.dumps(source_notes))}, 0, NULL, 0, 'draft', NULL, {sort}, {NOW}, {NOW}, {q(ACTOR)}, NULL);")
out.append(product('prd_npl006', 'NPL-006', 'retatrutide', 'Retatrutide', 'Retatrutide (LY3437943)', ['LY3437943', 'LY-3437943'],
    '2381089-83-2', 'C221H342N46O68', '4731 g/mol', '4730.478', 'MLOLQJNKXBNWFW-SAGGEDDASA-N', '171390338',
    'A synthetic, lipidated 39-residue peptide. Supplied lyophilised. Identity is confirmed by HPLC retention-time matching and purity determined by reversed-phase HPLC against the lot certificate. No USP or NF monograph exists for this substance. DRAFT: held for regulatory-counsel disposition before publication.',
    ['Molecular formula, molecular weight, exact mass and InChI Key from PubChem CID 171390338 (compound record; no CAS is attached to the PubChem record).',
     'CAS 2381089-83-2 per MedChemExpress datasheet HY-P3506 and InvivoGen product listing; not independently registered by us.',
     'Sequence is not reproduced here: published sequences differ in the placement of the lipid moiety and the record is left blank rather than copied from a vendor.',
     'Counsel hold: named in FDA warning letters of 31 Mar 2026 (Gram Peptides, ref. 721806, among others) and in Eli Lilly consumer-protection suits filed 12 Aug 2026.'], 60))
out.append(product('prd_npl007', 'NPL-007', 'tirzepatide', 'Tirzepatide', 'Tirzepatide (JAN/USAN)', ['LY3298176'],
    '2023788-19-2', 'C225H348N48O68', '4813 g/mol', '4812.532', 'BTSOGEDATSQOAF-MCNPHUAVSA-N', '166567236',
    'A synthetic, lipidated 39-residue peptide. Supplied lyophilised. Identity and purity per the lot certificate. No USP or NF monograph exists for this substance. DRAFT: active ingredient of FDA-approved drugs; held for regulatory-counsel disposition before publication.',
    ['CAS 2023788-19-2, molecular formula, molecular weight, exact mass and InChI Key from PubChem CID 166567236.',
     'No certificate of analysis is on file for the two lots in stock (owner inventory list: COA n/a); the lots stay in quarantine until tested.',
     'Counsel hold: active ingredient of FDA-approved products; named in FDA warning letters of 31 Mar 2026.'], 70))
def variant(vid, pid, sku, qty, price, sort):
    return ("INSERT OR IGNORE INTO product_variants (id, product_id, sku, quantity, presentation, list_price_cents, institutional_price_cents, active, sort_order, created_at, updated_at) "
            f"VALUES ({q(vid)}, {q(pid)}, {q(sku)}, {q(qty)}, 'Lyophilised solid, sealed 3 mL vial', {price}, {price}, 1, {sort}, {NOW}, {NOW});")
out += [variant('var_npl00610mg','prd_npl006','NPL-006-10MG','10 mg',5500,0), variant('var_npl00630mg','prd_npl006','NPL-006-30MG','30 mg',7000,10),
        variant('var_npl00710mg','prd_npl007','NPL-007-10MG','10 mg',4700,0), variant('var_npl00730mg','prd_npl007','NPL-007-30MG','30 mg',5600,10)]
for pid, code, name in [('prd_npl006','NPL-006','Retatrutide'),('prd_npl007','NPL-007','Tirzepatide')]:
    out.append("INSERT OR IGNORE INTO product_revisions (id, product_id, product_code, action, snapshot, changed_by, changed_by_name, note, created_at) VALUES ("
               f"{q(hid('prv','create-'+code))}, {q(pid)}, {q(code)}, 'create', {q(json.dumps({'visibility':'draft','name':name,'note':'seeded by launch pass'}))}, 'launch-pass', {q(ACTOR)}, "
               f"'Draft record created from the owner inventory list of 12 Sep 2026. Publication blocked by counsel hold (lib/catalog-rules.ts COUNSEL_HOLD).', {NOW});")

# ---------- 3. Lots ----------
ILS_LAB = 'ILS Laboratories, 8222 Vickers St, Suite 106, San Diego, CA 92111 (ISO/IEC 17025 accredited)'
LOTS = [
 dict(lot='GHKCU50-2605-01', code='NPL-004', name='GHK-Cu', cas='89030-95-5', received=50, remaining=47, unit_cost=300, container='50 mg',
      coa=dict(file='nexphase-labs-GHKCU50-2605-01-mHiuaG.pdf', number='COA-2026-ZKMVY2', accession='ACC-2026-7333', issued='2026-08-03', analysis='2026-07-21', access='4TAYNVTL'),
      purity='99.80%', npc='51.17 mg (labeled 50 mg)', identity='GHK-Cu', metals=False),
 dict(lot='NP3R10-2605-01', code='NPL-006', name='Retatrutide', cas='2381089-83-2', received=27, remaining=27, unit_cost=800, container='10 mg',
      coa=dict(file='nexphase-labs-NP3R10-2605-01-6fENW-.pdf', number='COA-2026-OH42ST', accession=None, issued='2026-07-14', analysis='2026-07-14', access='DABHQL2T'),
      purity='99.23%', npc='10.58 mg (labeled 10 mg)', identity='Retatrutide', metals=True),
 dict(lot='NP3R30-2605-01', code='NPL-006', name='Retatrutide', cas='2381089-83-2', received=20, remaining=20, unit_cost=1500, container='30 mg',
      coa=dict(file='nexphase-labs-NP3R30-2605-01-lcVrl3.pdf', number='COA-2026-FU_PJB', accession=None, issued='2026-07-14', analysis='2026-07-14', access='JW7B6AQQ'),
      purity='99.96%', npc='31.81 mg (labeled 30 mg)', identity='Retatrutide', metals=True),
 dict(lot='NP2T10-2605-01', code='NPL-007', name='Tirzepatide', cas='2023788-19-2', received=30, remaining=27, unit_cost=470, container='10 mg', coa=None),
 dict(lot='NP2T30-2605-01', code='NPL-007', name='Tirzepatide', cas='2023788-19-2', received=30, remaining=27, unit_cost=900, container='30 mg', coa=None),
]
SHA = {l.strip().split()[1].split('/')[-1]: l.split()[0] for l in open('coa.sha').read().strip().splitlines()}
SIZE = json.load(open('coa.size'))
RECEIVED_AT = ts('2026-07-01')  # ILS sample-receipt date: earliest documented date; correct from the supplier invoice
for L in LOTS:
    lid = hid('lot', 'launch-' + L['lot'])
    coa = L['coa']
    release_here = MODE == 'staging' and L['lot'] == 'GHKCU50-2605-01'
    status = 'released' if release_here else 'quarantine'
    if coa:
        std = f"ILS Laboratories Full QC Panel (certificate {coa['number']}, issued {coa['issued']}; verify at ils-lab.com with access code {coa['access']})"
        reason = ("Loaded from the owner inventory list and the ILS certificate. " +
                  ("Receipt date is the ILS sample-receipt date (earliest documented); correct from the supplier invoice. " ) +
                  ("Manufacturer name and address not yet recorded: required before release (16 CCR 1736.9(d)). " if not release_here else
                   "STAGING ONLY: released for rehearsal with a placeholder manufacturer so orders can be tested end to end; production keeps this lot in quarantine until the manufacturer is recorded and Melissa releases it. ") +
                  ("" if coa['accession'] else "The ILS certificate carries a COA number but no accession number; request the accession from ILS before publication. "))
        accession = coa['accession'] or None
    else:
        std = None
        reason = ("Loaded from the owner inventory list. No certificate of analysis on file (owner list: COA n/a); identity and purity untested. "
                  "Stays in quarantine until a retained sample is tested by the contract laboratory and the manufacturer is recorded.")
        accession = None
    manu_name = "PENDING (staging placeholder) - supplier of record to be entered by the owner" if release_here else None
    manu_addr = "PENDING (staging placeholder)" if release_here else None
    cost = L['unit_cost'] * L['received']
    cost_note = f"Owner inventory list 12 Sep 2026: ${L['unit_cost']/100:.2f}/vial x {L['received']} vials, material only; contract-laboratory testing fee is recorded separately."
    coa_key = None
    if coa:
        coa_key = f"lots/{L['lot']}/coa/{hashlib.sha256(('coa-'+L['lot']).encode()).hexdigest()[:32]}.pdf"
    out.append("INSERT OR IGNORE INTO lots (id, lot_number, product_code, product_name, cas_number, manufacturer_name, manufacturer_address, supplier_name, country_of_origin, entry_number, manufacture_date, received_at, "
               "purity_result, purity_method, identity_confirmed, identity_method, water_content, heavy_metals_summary, coa_key, chromatogram_key, mass_spec_key, sds_key, status, released_by, released_at, status_reason, "
               "quantity_received, quantity_remaining, storage_location, storage_condition, retest_date, superseded_by_id, created_at, updated_at, last_movement_id, cost_cents, cost_note, accession_number, analytical_lab, net_peptide_content, appearance, testing_standard, purchase_order_line_id, container_size) VALUES ("
               f"{q(lid)}, {q(L['lot'])}, {q(L['code'])}, {q(L['name'])}, {q(L['cas'])}, {q(manu_name)}, {q(manu_addr)}, NULL, NULL, NULL, NULL, {RECEIVED_AT}, "
               f"{q(L.get('purity'))}, {q('HPLC (ILS Full QC Panel)' if coa else None)}, {1 if coa else 0}, {q('HPLC-RTM (ILS)' if coa else None)}, NULL, {q('ICP-MS: As, Cd, Cr, Hg, Pb not detected (ILS)' if coa and L['metals'] else None)}, {q(coa_key)}, NULL, NULL, NULL, "
               f"{q(status)}, {q(ACTOR if release_here else None)}, {NOW if release_here else 'NULL'}, {q(reason)}, "
               f"{q(str(L['received'])+' vials')}, {q(str(L['remaining'])+' vials')}, NULL, NULL, NULL, NULL, {NOW}, {NOW}, NULL, {cost}, {q(cost_note)}, {q(accession)}, {q(ILS_LAB if coa else None)}, {q(L.get('npc'))}, {q('Good (ILS appearance check)' if coa else None)}, {q(std)}, NULL, {q(L['container'])});")
    out.append(f"UPDATE lots SET container_size={q(L['container'])} WHERE lot_number={q(L['lot'])} AND superseded_by_id IS NULL AND container_size IS NULL;")
    # movements: receipt, then a sample decrease when the owner list shows fewer on hand than received
    mv = hid('mov', 'receipt-' + L['lot'])
    out.append("INSERT OR IGNORE INTO lot_movements (id, lot_id, movement_type, direction, quantity, account_id, consignee_name, consignee_institution, ship_to_address, carrier, tracking_number, witness_one, witness_two, occurred_at, recorded_by, note, created_at) "
               f"VALUES ({q(mv)}, {q(lid)}, 'receipt', 'increase', {q(str(L['received'])+' vials')}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, {RECEIVED_AT}, {q(ACTOR)}, 'Opening balance from the owner inventory list of 12 Sep 2026 (vials bought).', {NOW});")
    last = mv
    if L['remaining'] < L['received']:
        diff = L['received'] - L['remaining']
        mv2 = hid('mov', 'sample-' + L['lot'])
        out.append("INSERT OR IGNORE INTO lot_movements (id, lot_id, movement_type, direction, quantity, account_id, consignee_name, consignee_institution, ship_to_address, carrier, tracking_number, witness_one, witness_two, occurred_at, recorded_by, note, created_at) "
                   f"VALUES ({q(mv2)}, {q(lid)}, 'sample', 'decrease', {q(str(diff)+' vials')}, NULL, {q('ILS Laboratories (presumed)')}, NULL, NULL, NULL, NULL, NULL, NULL, {RECEIVED_AT}, {q(ACTOR)}, "
                   f"'Owner inventory list shows {L['remaining']} on hand of {L['received']} bought. Recorded as test samples to the contract laboratory; the owner is to confirm the disposition of these {diff} vials.', {NOW});")
        last = mv2
    out.append(f"UPDATE lots SET last_movement_id={q(last)} WHERE id={q(lid)} AND last_movement_id IS NULL;")
    # cost event
    out.append("INSERT OR IGNORE INTO lot_status_events (id, lot_id, from_status, to_status, reason, decided_by, kind, created_at) VALUES ("
               f"{q(hid('evt','cost-'+L['lot']))}, {q(lid)}, 'quarantine', 'quarantine', {q('Landed cost recorded at intake: $'+format(cost/100,'.2f')+' ('+cost_note+').')}, {q(ACTOR)}, 'cost', {NOW});")
    # tests from the certificate
    if coa:
        tested_at = ts(coa['analysis'])
        tests = [('identity', None, 'HPLC-RTM', f"{L['identity']} - Confirmed", L['identity'], 1),
                 ('purity', None, 'HPLC', L['purity'], '>= 95.0%', 1)]
        if L['metals']:
            for an, spec in [('Arsenic (As)','NMT 1.5 ppm'),('Cadmium (Cd)','NMT 0.5 ppm'),('Chromium (Cr)','NMT 10 ppm'),('Mercury (Hg)','NMT 1.5 ppm'),('Lead (Pb)','NMT 1 ppm')]:
                tests.append(('heavy_metal', an, 'ICP-MS', 'Not Detected', spec, 1))
        for i,(tt, an, method, result, spec, passed) in enumerate(tests):
            out.append("INSERT OR IGNORE INTO lot_tests (id, lot_id, test_type, analyte, method, result, specification, passed, tested_by, tested_at, created_at) VALUES ("
                       f"{q(hid('tst', L['lot']+'-'+tt+'-'+str(an or i)))}, {q(lid)}, {q(tt)}, {q(an)}, {q(method)}, {q(result)}, {q(spec)}, {passed}, 'ILS Laboratories', {tested_at}, {NOW});")
        # certificate document
        out.append("INSERT OR IGNORE INTO lot_documents (id, lot_id, document_type, object_key, content_type, size_bytes, original_name, uploaded_by, uploaded_at, sha256, superseded_at, created_at) VALUES ("
                   f"{q(hid('doc','coa-'+L['lot']))}, {q(lid)}, 'coa', {q(coa_key)}, 'application/pdf', {SIZE[coa['file']]}, {q(coa['file'])}, {q(ACTOR)}, {NOW}, {q(SHA[coa['file']])}, NULL, {NOW});")
    if release_here:
        out.append("INSERT OR IGNORE INTO lot_status_events (id, lot_id, from_status, to_status, reason, decided_by, kind, created_at) VALUES ("
                   f"{q(hid('evt','release-staging-'+L['lot']))}, {q(lid)}, 'quarantine', 'released', "
                   "'STAGING REHEARSAL RELEASE. Identity and purity per ILS COA-2026-ZKMVY2 (accession ACC-2026-7333); certificate on file; manufacturer is a labelled placeholder. Not a production release decision; Melissa releases on production.', "
                   f"{q(ACTOR)}, 'disposition', {NOW});")
open(f'launch-data-{MODE}.sql','w').write('\n'.join(out)+'\n')
print(MODE, len(out), 'statements')
