import { getDb } from '@/db';
import { lots, products, productVariants } from '@/db/schema';
import { createGuestBuyer } from '@/lib/buyer-session';
import { addToCart } from '@/lib/cart';
import { createOrderFromCart, getOrderByNumber } from '@/lib/orders';
import { visibilityFor } from '@/lib/visibility-rules';

export async function seedCommerceFixture() {
  await getDb().insert(products).values({ id: 'p', code: 'NPL-9999', slug: 'synthetic', name: 'Synthetic only', formalName: 'Test', chemicalClass: 'Test', casNumber: '50-00-0', molecularFormula: 'Test', molecularWeight: 'Test', purity: 'Test', form: 'Test', saltForm: 'Test', storageSolid: 'Test', storageStock: 'Test', stability: 'Test', shipping: 'Test', description: 'Local synthetic fixture', visibility: 'published' });
  await getDb().insert(productVariants).values({ id: 'v', productId: 'p', sku: 'NPL-9999-2MG', quantity: '2 mg', presentation: 'powder', listPriceCents: 100, active: true });
  await getDb().insert(lots).values({ id: 'l', lotNumber: 'SYNTHETIC-LOT', productCode: 'NPL-9999', productName: 'Synthetic', casNumber: '50-00-0', status: 'released', analyticalLab: 'Fixture lab', accessionNumber: 'ACC-FIXTURE', testingStandard: 'Fixture panel v1', receivedAt: new Date(), quantityRemaining: '10 mg', quantityReceived: '10 mg' });
}
export async function syntheticBuyer(packs = 1) {
  const guest = await createGuestBuyer(true);
  const visibility = visibilityFor(null, false, true);
  await addToCart(guest.buyer.id, 'NPL-9999-2MG', packs, visibility);
  const submit = async () => createOrderFromCart(guest.buyer, visibility, { consigneeName: 'Synthetic', consigneeInstitution: null, line1: '1 Test St', line2: null, city: 'Test', region: 'CA', postalCode: '00000', country: 'US', phone: null }, null, null, crypto.randomUUID().replace(/-/g, ''), 'synthetic@example.invalid');
  return { ...guest, submit };
}
export async function syntheticOrder(packs = 1) {
  const guest = await syntheticBuyer(packs);
  const result = await guest.submit();
  if (!result.ok) throw new Error(result.error);
  return { ...guest, detail: (await getOrderByNumber(result.orderNumber))! };
}
