import { describe, it, expect } from 'vitest';
import { checkOrigin, evidenceForm, jsonBody } from '../src/lib/security';
describe('request boundaries', () => {
  it('rejects missing and foreign origins', () => {
    expect(() => checkOrigin(new Request('http://localhost:3000/api/v1/projects'))).toThrow();
    expect(() =>
      checkOrigin(
        new Request('http://localhost:3000/api/v1/projects', {
          headers: { Origin: 'https://foreign.example' },
        }),
      ),
    ).toThrow();
  });
  it('bounds streamed JSON even without a declared length', async () => {
    const req = new Request('http://localhost:3000', {
      method: 'POST',
      body: JSON.stringify({ text: 'x'.repeat(200001) }),
    });
    await expect(jsonBody(req)).rejects.toThrow('too large');
  });
  it('rejects invalid JSON', async () => {
    await expect(
      jsonBody(new Request('http://localhost:3000', { method: 'POST', body: '{invalid' })),
    ).rejects.toThrow('Invalid JSON');
  });
  it('parses private multipart artifacts through a bounded buffer', async () => {
    const form = new FormData();
    form.set('notes', 'test');
    form.set('files', new File(['text'], 'a.txt', { type: 'text/plain' }));
    const encoded = new Request('http://localhost:3000', { method: 'POST', body: form });
    const bytes = await encoded.arrayBuffer();
    const req = new Request('http://localhost:3000', {
      method: 'POST',
      headers: {
        'Content-Type': encoded.headers.get('content-type')!,
        'Content-Length': String(bytes.byteLength),
      },
      body: bytes,
    });
    const parsed = await evidenceForm(req);
    expect(parsed.get('notes')).toBe('test');
    expect(parsed.get('files')).toBeInstanceOf(File);
  });
});
