/**
 * Uploads larger than the framework's server-action body limit.
 *
 * vinext treats every multipart POST without an action id as a possible
 * progressive server action — route handlers included. Before the handler runs it
 * answers any body over `serverActions.bodySizeLimit` (next.config.ts) with a bare
 * "413 Payload Too Large", and below that it clones the request and reads the whole
 * form looking for an action. So a 4 MB certificate never reached its upload
 * route, and simply raising the limit to 25 MB would read every large upload twice
 * — close to the Worker's memory ceiling — while loosening the limit on every
 * other POST.
 *
 * Instead worker.ts relabels multipart bodies bound for the routes below, so the
 * framework hands them over untouched, and each of those routes reads its form
 * back with readUploadForm(), which also stops at the route's own size limit.
 * Every other multipart POST still meets the framework limit.
 *
 * Each of these routes refuses cross-origin and anonymous requests before it reads
 * the body, so skipping the framework's pre-read loses no protection. Remove this
 * module once vinext stops pre-reading multipart bodies bound for route handlers.
 */

/** Routes that accept files over the framework limit. Each reads its body with readUploadForm(). */
export const LARGE_UPLOAD_ROUTES: readonly RegExp[] = [
  /^\/api\/manage\/lots\/[^/]+\/documents$/,
  /^\/api\/manage\/products\/[^/]+\/sds$/,
  /^\/api\/manage\/products\/[^/]+\/image$/,
  /^\/api\/account\/organization\/documents$/,
];

/** What a relabelled upload is handed to the framework as. Deliberately not multipart/*. */
export const SHIELDED_UPLOAD_TYPE = 'application/x-nexphase-upload';

/** Carries the upload's real content type, boundary included. Only the worker sets it. */
export const UPLOAD_TYPE_HEADER = 'x-nexphase-upload-type';

/** Multipart boundaries, part headers and a form's text fields, on top of the file itself. */
export const MULTIPART_ALLOWANCE_BYTES = 256 * 1024;

export class UploadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`The upload is larger than ${limitBytes} bytes.`);
    this.name = 'UploadTooLargeError';
  }
}

export function isLargeUploadRoute(pathname: string): boolean {
  return LARGE_UPLOAD_ROUTES.some((route) => route.test(pathname));
}

/**
 * The request to hand the framework. A multipart POST to a large-upload route has
 * its content type moved into UPLOAD_TYPE_HEADER. An UPLOAD_TYPE_HEADER that a
 * client sent itself is always removed, so the header can only come from here.
 */
export function shieldLargeUpload(request: Request, pathname: string): Request {
  const type = request.headers.get('content-type') ?? '';
  const shield =
    request.method === 'POST' &&
    type.toLowerCase().startsWith('multipart/form-data') &&
    isLargeUploadRoute(pathname);
  if (!shield && !request.headers.has(UPLOAD_TYPE_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(UPLOAD_TYPE_HEADER);
  if (shield) {
    headers.set(UPLOAD_TYPE_HEADER, type);
    headers.set('content-type', SHIELDED_UPLOAD_TYPE);
  }
  return new Request(request, { headers });
}

/**
 * The form posted to a large-upload route, whether or not the worker relabelled
 * it (tests and local tools may call a route directly). Reading stops as soon as
 * the body passes the route's limit plus multipart framing.
 *
 * @throws UploadTooLargeError when the body is over the limit
 * @throws TypeError when the body is not a form
 */
export async function readUploadForm(request: Request, maxFileBytes: number): Promise<FormData> {
  const limit = maxFileBytes + MULTIPART_ALLOWANCE_BYTES;
  if (Number(request.headers.get('content-length')) > limit) {
    throw new UploadTooLargeError(maxFileBytes);
  }

  const type = request.headers.get('content-type') ?? '';
  const formType = type.toLowerCase().startsWith(SHIELDED_UPLOAD_TYPE)
    ? request.headers.get(UPLOAD_TYPE_HEADER)
    : type;
  if (!formType || !request.body) throw new TypeError('The request does not carry a form.');

  // Pulled one chunk at a time, so an oversized body is cancelled at its source
  // instead of being left to write into a stream that has already failed.
  const reader = request.body.getReader();
  let received = 0;
  const counted = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > limit) {
        await reader.cancel().catch(() => undefined);
        controller.error(new UploadTooLargeError(maxFileBytes));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  try {
    return await new Response(counted, { headers: { 'content-type': formType } }).formData();
  } catch (error) {
    if (received > limit) throw new UploadTooLargeError(maxFileBytes);
    throw error;
  }
}
