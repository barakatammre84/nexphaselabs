import { describe, expect, it } from 'vitest';
import { boundedJson } from '@/lib/provider-response';
describe('bounded provider JSON', () => {
  it('decodes valid JSON within the limit', async () => {
    await expect(boundedJson(Response.json({ ok: true }), 100)).resolves.toEqual({ ok: true });
  });
  it('rejects declared and chunked oversized responses before decoding', async () => {
    await expect(boundedJson(new Response('{}', { headers: { 'content-length': '101' } }), 100)).rejects.toThrow('too large');
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(70)); controller.enqueue(new Uint8Array(70)); controller.close(); } });
    await expect(boundedJson(new Response(body), 100)).rejects.toThrow('too large');
  });
  it('rejects invalid UTF-8 and JSON', async () => {
    await expect(boundedJson(new Response(new Uint8Array([255])))).rejects.toThrow();
    await expect(boundedJson(new Response('{'))).rejects.toThrow();
  });
});
