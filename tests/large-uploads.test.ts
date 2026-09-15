import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LARGE_UPLOAD_ROUTES,
  SHIELDED_UPLOAD_TYPE,
  UPLOAD_TYPE_HEADER,
  UploadTooLargeError,
  isLargeUploadRoute,
  readUploadForm,
  shieldLargeUpload,
} from '@/lib/large-uploads';

const MB = 1024 * 1024;
const ORIGIN = 'https://nexphaselabs.test';

/**
 * A multipart upload, serialised first the way a network body arrives. (A request
 * streamed straight from a FormData object throws inside Node's fetch internals
 * when its reader is cancelled part-way, which the size limit does on purpose.)
 */
async function multipart(pathname: string, fileBytes: number, fields: Record<string, string> = { type: 'coa' }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', new File([new Uint8Array(fileBytes)], 'certificate.pdf', { type: 'application/pdf' }));
  const encoded = new Response(form);
  return new Request(`${ORIGIN}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
    body: await encoded.arrayBuffer(),
  });
}

const UPLOAD_PATHS = [
  '/api/manage/lots/GHKCU50-2605-01/documents',
  '/api/manage/products/NPL-004/sds',
  '/api/manage/products/NPL-004/image',
  '/api/account/organization/documents',
];

describe('shieldLargeUpload', () => {
  it.each(UPLOAD_PATHS)('relabels a multipart upload to %s so the framework does not pre-read it', async (pathname) => {
    const original = await multipart(pathname, 1024);
    const realType = original.headers.get('content-type') ?? '';
    const shielded = shieldLargeUpload(original, pathname);
    // vinext pre-reads any POST whose content type starts with multipart/form-data.
    expect(shielded.headers.get('content-type')?.startsWith('multipart/form-data')).toBe(false);
    expect(shielded.headers.get('content-type')).toBe(SHIELDED_UPLOAD_TYPE);
    expect(shielded.headers.get(UPLOAD_TYPE_HEADER)).toBe(realType);
    expect(realType).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('leaves every other request untouched', async () => {
    const screenshot = await multipart('/api/feedback/screenshots', 1024);
    expect(shieldLargeUpload(screenshot, '/api/feedback/screenshots')).toBe(screenshot);
    const page = new Request(`${ORIGIN}/manage/lots/GHKCU50-2605-01`);
    expect(shieldLargeUpload(page, '/manage/lots/GHKCU50-2605-01')).toBe(page);
    const read = new Request(`${ORIGIN}/api/manage/lots/GHKCU50-2605-01/documents`);
    expect(shieldLargeUpload(read, '/api/manage/lots/GHKCU50-2605-01/documents')).toBe(read);
  });

  it('removes a relabel header the client sent itself', async () => {
    const elsewhere = new Request(`${ORIGIN}/api/cart`, {
      method: 'POST',
      headers: {
        [UPLOAD_TYPE_HEADER]: 'multipart/form-data; boundary=x',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'sku=NPL-004-50MG',
    });
    expect(shieldLargeUpload(elsewhere, '/api/cart').headers.has(UPLOAD_TYPE_HEADER)).toBe(false);

    const pathname = '/api/account/organization/documents';
    const forged = new Request(`${ORIGIN}${pathname}`, {
      method: 'POST',
      headers: { [UPLOAD_TYPE_HEADER]: 'multipart/form-data; boundary=x', 'content-type': SHIELDED_UPLOAD_TYPE },
      body: '--x--',
    });
    const cleaned = shieldLargeUpload(forged, pathname);
    expect(cleaned.headers.has(UPLOAD_TYPE_HEADER)).toBe(false);
    await expect(readUploadForm(cleaned, 25 * MB)).rejects.toThrow(TypeError);
  });
});

describe('readUploadForm', () => {
  it('reads a relabelled upload back intact', async () => {
    const pathname = '/api/manage/lots/GHKCU50-2605-01/documents';
    const form = await readUploadForm(shieldLargeUpload(await multipart(pathname, 4 * MB), pathname), 25 * MB);
    expect(form.get('type')).toBe('coa');
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).size).toBe(4 * MB);
    expect((file as File).name).toBe('certificate.pdf');
  });

  it('reads a form the worker did not relabel, multipart or urlencoded', async () => {
    const direct = await readUploadForm(
      await multipart('/api/manage/products/NPL-004/sds', 1024, { revision: 'R2' }),
      25 * MB,
    );
    expect(direct.get('revision')).toBe('R2');

    const remove = await readUploadForm(
      new Request(`${ORIGIN}/api/manage/products/NPL-004/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'action=remove',
      }),
      10 * MB,
    );
    expect(remove.get('action')).toBe('remove');
  });

  it('stops reading once the body passes the route limit', async () => {
    const pathname = '/api/account/organization/documents';
    const oversized = shieldLargeUpload(await multipart(pathname, 2 * MB), pathname);
    await expect(readUploadForm(oversized, 1 * MB)).rejects.toBeInstanceOf(UploadTooLargeError);
  });
});

describe('large-upload routes', () => {
  const appDir = path.join(process.cwd(), 'app');
  const routeFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return routeFiles(full);
      return name === 'route.ts' ? [full] : [];
    });
  const uploads = routeFiles(path.join(appDir, 'api')).filter((file) =>
    /MAX_(DOCUMENT|IMAGE)_BYTES/.test(readFileSync(file, 'utf8')),
  );

  it('relabels every route that accepts files over the framework limit, and nothing else', () => {
    expect(uploads.length).toBe(LARGE_UPLOAD_ROUTES.length);
    for (const file of uploads) {
      const url = `/${path
        .relative(appDir, path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/^\[.+\]$/, 'sample'))
        .join('/')}`;
      const source = readFileSync(file, 'utf8');
      expect(isLargeUploadRoute(url), url).toBe(true);
      expect(source, url).toContain('readUploadForm(request');
      expect(source, url).not.toContain('request.formData()');
    }
  });
});
