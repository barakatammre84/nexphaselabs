import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getOrderByNumber } from '@/lib/orders';
import { orderNumberFromParam } from '@/lib/order-rules';
import { currentShippingLabel } from '@/lib/shipping-labels';
import { canFulfil, getStaffFromRequest } from '@/lib/staff-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  if (!canFulfil(staff)) return new Response('Forbidden', { status: 403 });
  const number = orderNumberFromParam((await context.params).orderNumber);
  if (!number) return new Response('Not found', { status: 404 });
  const detail = await getOrderByNumber(number);
  if (!detail) return new Response('Not found', { status: 404 });
  const label = await currentShippingLabel(detail.order.id);
  if (!label || label.state !== 'ready' || !label.test)
    return new Response('Not found', { status: 404 });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([288, 432]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({
    x: 8,
    y: 8,
    width: 272,
    height: 416,
    borderWidth: 4,
    borderColor: rgb(0.74, 0.08, 0.08),
  });
  page.drawText('TEST LABEL — NOT VALID', {
    x: 30,
    y: 385,
    size: 18,
    font: bold,
    color: rgb(0.74, 0.08, 0.08),
  });
  page.drawText(`${label.carrier} ${label.serviceName}`, {
    x: 24,
    y: 345,
    size: 15,
    font: bold,
  });
  page.drawText(detail.order.consigneeName, {
    x: 24,
    y: 310,
    size: 12,
    font: bold,
  });
  const address = [
    detail.order.shipToLine1,
    detail.order.shipToLine2,
    `${detail.order.shipToCity}, ${detail.order.shipToRegion} ${detail.order.shipToPostalCode}`,
    detail.order.shipToCountry,
  ].filter(Boolean);
  address.forEach((line, index) =>
    page.drawText(String(line), {
      x: 24,
      y: 287 - index * 18,
      size: 11,
      font: regular,
    }),
  );
  page.drawText(`Order ${detail.order.orderNumber}`, {
    x: 24,
    y: 175,
    size: 11,
    font: regular,
  });
  page.drawText(label.trackingNumber ?? 'TEST', {
    x: 24,
    y: 145,
    size: 16,
    font: bold,
  });
  page.drawText('Synthetic staging artifact. Do not tender to a carrier.', {
    x: 24,
    y: 40,
    size: 8,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });
  const bytes = await pdf.save();
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="TEST-${number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
