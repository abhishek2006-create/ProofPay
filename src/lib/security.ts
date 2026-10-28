import { createHash } from 'node:crypto';
import { db } from './db';
import { ensure } from './errors';
export async function rateLimit(key: string, limit = 30, windowMs = 60000) {
  const hash = createHash('sha256').update(key).digest('hex');
  const now = new Date();
  const count = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","resetAt") VALUES (${hash},1,${new Date(now.getTime() + windowMs)}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count"+1 END, "resetAt"=CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${new Date(now.getTime() + windowMs)} ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  ensure(count[0].count <= limit, 429, 'Too many requests. Please try again shortly.');
}
export function checkOrigin(req: Request) {
  const expected = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  ensure(req.headers.get('origin') === expected, 403, 'Request origin is not permitted.');
}
export async function jsonBody(req: Request) {
  ensure(Number(req.headers.get('content-length') ?? 0) < 200000, 413, 'Request is too large.');
  const reader = req.body?.getReader();
  ensure(reader, 400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size >= 200000) {
      await reader.cancel();
      ensure(false, 413, 'Request is too large.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    ensure(false, 400, 'Invalid JSON request.');
  }
}
export async function evidenceForm(req: Request) {
  const limit = 12 * 1024 * 1024;
  ensure(
    Number(req.headers.get('content-length')) > 0 &&
      Number(req.headers.get('content-length')) < limit,
    413,
    'Evidence request must be less than 12 MB.',
  );
  const reader = req.body?.getReader();
  ensure(reader, 400, 'Evidence body is required.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size >= limit) {
      await reader.cancel();
      ensure(false, 413, 'Evidence request must be less than 12 MB.');
    }
    chunks.push(new Uint8Array(value));
  }
  const copy = new Response(new Blob(chunks), {
    headers: { 'Content-Type': req.headers.get('content-type') ?? '' },
  });
  return copy.formData();
}
