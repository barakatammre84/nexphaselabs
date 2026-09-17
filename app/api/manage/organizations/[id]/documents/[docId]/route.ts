import { documentResponse, getOrganizationDocument } from '@/lib/documents';
import { getOrganizationDocumentById } from '@/lib/organizations';
import { canVerifyAccounts, getStaffFromRequest } from '@/lib/staff-auth';

/** Staff download of an applicant's supporting document. Never public. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const staff = await getStaffFromRequest(request);
  if (!staff) return new Response('Unauthorized', { status: 401 });
  // Same capability as the page that links here; a staff session alone is not enough to pull
  // somebody's uploaded business licence.
  if (!canVerifyAccounts(staff)) return new Response('Forbidden', { status: 403 });
  const { id, docId } = await params;
  if (!/^org_[a-z0-9]{8,32}$/.test(id) || !/^odc_[a-z0-9]{8,32}$/.test(docId)) return new Response('Not found', { status: 404 });
  const doc = await getOrganizationDocumentById(id, docId);
  if (!doc) return new Response('Not found', { status: 404 });
  const object = await getOrganizationDocument(doc.objectKey);
  if (!object) return new Response('Not found', { status: 404 });
  const ext = doc.objectKey.split('.').pop() ?? 'bin';
  return documentResponse(object, `${id}-${doc.kind}.${ext}`, new URL(request.url).searchParams.get('inline') === '1');
}
