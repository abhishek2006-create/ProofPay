import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkOrigin, evidenceForm, jsonBody } from '../src/lib/security';
describe('request boundaries', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('permits local development aliases only on the configured protocol and port', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'development');
    const request = (origin: string, target = 'http://127.0.0.1:3000/api/v1/register') =>
      new Request(target, { headers: { Origin: origin } });
    expect(() => checkOrigin(request('http://127.0.0.1:3000'))).not.toThrow();
    expect(() => checkOrigin(request('http://localhost:3000'))).not.toThrow();
    for (const origin of [
      'http://127.0.0.1:3001',
      'https://127.0.0.1:3000',
      'http://localhost.attacker.example:3000',
      'null',
    ]) {
      expect(() => checkOrigin(request(origin))).toThrow('origin');
    }
    expect(() =>
      checkOrigin(request('http://127.0.0.1:3000', 'https://foreign.example/api/v1/register')),
    ).toThrow('origin');
  });
  it('requires the exact configured origin in production', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      checkOrigin(
        new Request('http://localhost:3000/api/v1/register', {
          headers: { Origin: 'http://127.0.0.1:3000' },
        }),
      ),
    ).toThrow('origin');
    expect(() =>
      checkOrigin(
        new Request('http://localhost:3000/api/v1/register', {
          headers: { Origin: 'http://localhost:3000' },
        }),
      ),
    ).not.toThrow();
  });
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
