import { Client } from '@elastic/elasticsearch';
import { db } from './db';
import { ensure } from './errors';
import { assertClient, getProject, type Actor } from './projects';
export function elasticConfigured() {
  return Boolean(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY);
}
function elastic() {
  ensure(elasticConfigured(), 503, 'Elastic is not configured. Local project search is available.');
  const url = new URL(process.env.ELASTIC_URL!);
  ensure(url.protocol === 'https:', 500, 'Elastic requires HTTPS.');
  return new Client({
    node: url.href,
    auth: { apiKey: process.env.ELASTIC_API_KEY! },
    requestTimeout: 10000,
  });
}
export async function indexProject(user: Actor, id: string) {
  const p = await getProject(user, id);
  assertClient(user, p);
  const people = await db.user.findMany({ where: { id: { in: [p.clientId, p.freelancerId] } } });
  ensure(
    people.every((u) => u.elasticConsent),
    403,
    'Both project members must opt in to Elastic indexing in Settings.',
  );
  const client = elastic();
  for (const m of p.milestones) {
    await client.index({
      index: 'proofpay-criteria',
      id: m.id,
      document: {
        projectId: id,
        title: m.title,
        criteria: m.specifications[0]?.requirements.map((r) => r.description).join('\n'),
      },
      refresh: 'wait_for',
    });
  }
  return { indexed: p.milestones.length };
}
export async function searchEvidence(user: Actor, query: string) {
  const memberships = await db.project.findMany({
    where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
    select: {
      id: true,
      client: { select: { elasticConsent: true } },
      freelancer: { select: { elasticConsent: true } },
    },
  });
  const ids = memberships
    .filter((p) => p.client.elasticConsent && p.freelancer.elasticConsent)
    .map((p) => p.id);
  if (!ids.length) return { hits: [] };
  const response = await elastic().search<{ projectId: string; title: string; criteria: string }>({
    index: 'proofpay-criteria',
    size: 30,
    query: {
      bool: {
        filter: [{ terms: { projectId: ids } }],
        must: [{ multi_match: { query, fields: ['title', 'criteria'] } }],
      },
    },
  });
  return {
    hits: response.hits.hits
      .filter((h) => h._source && ids.includes(h._source.projectId))
      .map((h) => ({ id: h._id, ...h._source })),
  };
}
export async function deliverNotifications(user: Actor, projectId: string) {
  const p = await getProject(user, projectId);
  assertClient(user, p);
  const owner = await db.user.findUnique({ where: { id: p.clientId } });
  ensure(owner?.zapierConsent, 403, 'Enable optional Zapier notifications in Settings first.');
  ensure(process.env.ZAPIER_WEBHOOK_URL, 503, 'Zapier webhook is not configured.');
  const url = new URL(process.env.ZAPIER_WEBHOOK_URL);
  ensure(
    url.protocol === 'https:' &&
      url.hostname === 'hooks.zapier.com' &&
      url.pathname.startsWith('/hooks/catch/'),
    500,
    'Configure a valid Zapier Catch Hook URL.',
  );
  const deliveries = await db.delivery.findMany({
    where: { projectId, status: { not: 'DELIVERED' }, attempts: { lt: 3 } },
    take: 20,
  });
  let delivered = 0;
  for (const event of deliveries) {
    await db.delivery.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': event.id },
        body: JSON.stringify(event.payload),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (response.ok) {
        await db.delivery.update({ where: { id: event.id }, data: { status: 'DELIVERED' } });
        delivered++;
      }
    } catch {
      /* Durable retry remains visible in the delivery record. */
    }
  }
  return { delivered, pending: deliveries.length - delivered };
}
