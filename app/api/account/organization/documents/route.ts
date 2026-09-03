import { getAccountFromRequest } from '@/lib/account-auth';
import { MAX_DOCUMENT_BYTES, putOrganizationDocument } from '@/lib/documents';
import { DOCUMENT_KINDS } from '@/lib/organization-rules';
import { attachOrganizationDocument, getOrganizationForAccount, listOrganizationDocuments } from '@/lib/organizations';
import { sameOrigin } from '@/lib/staff-auth';

const MAX_DOCUMENTS = 6;

/** Applicant uploads a supporting document for their own organisation. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const account = await getAccountFromRequest(request);
  if (!account) return new Response('Unauthorized', { status: 401 });

  const back = (query: string) => Response.redirect(new URL(`/account/organization?${query}`, request.url), 303);

  const organization = await getOrganizationForAccount(account.id);
  if (!organization) return back('doc=noorg');
  if (organization.verificationStatus === 'approved') return back('doc=approved');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back('doc=badform');
  }
  const kind = String(form.get('kind') ?? '');
  const file = form.get('file');
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) return back('doc=kind');
  if (!(file instanceof File) || file.size === 0) return back('doc=nofile');
  if (file.size > MAX_DOCUMENT_BYTES) return back('doc=size');
  if ((await listOrganizationDocuments(organization.id)).length >= MAX_DOCUMENTS) return back('doc=limit');

  try {
    const stored = await putOrganizationDocument(organization.id, kind, file, {
      uploadedBy: account.id,
      originalName: file.name,
    });
    await attachOrganizationDocument(organization, kind, stored, file.name.slice(0, 200) || null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[organization] document upload failed', message);
    return back(/Unsupported document type/.test(message) ? 'doc=filetype' : 'doc=store');
  }
  return back('doc=ok');
}
