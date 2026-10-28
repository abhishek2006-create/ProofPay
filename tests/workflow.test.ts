import 'dotenv/config';
import { afterAll, describe, it, expect } from 'vitest';
import { db } from '../src/lib/db';
import {
  createProject,
  createMilestone,
  agree,
  editSpecification,
  getProject,
} from '../src/lib/projects';
import { submitEvidence, verifySubmission, decide } from '../src/lib/submissions';
import { createOrder } from '../src/lib/payments';
const enabled = Boolean(process.env.DATABASE_URL);
const createdIds: string[] = [];
afterAll(async () => {
  await db.$disconnect();
});
describe.skipIf(!enabled)('PostgreSQL workflow integration', () => {
  it('persists versioned agreement, submissions, revisions and acceptance; blocks unauthorized actions', async () => {
    const stamp = crypto.randomUUID();
    const client = await db.user.create({
      data: {
        name: 'Integration client',
        email: `client-${stamp}@example.test`,
        role: 'CLIENT',
        passwordHash: 'disabled-test-login',
      },
    });
    const freelancer = await db.user.create({
      data: {
        name: 'Integration freelancer',
        email: `freelancer-${stamp}@example.test`,
        role: 'FREELANCER',
        passwordHash: 'disabled-test-login',
      },
    });
    const outsider = await db.user.create({
      data: {
        name: 'Other client',
        email: `other-${stamp}@example.test`,
        role: 'CLIENT',
        passwordHash: 'disabled-test-login',
      },
    });
    createdIds.push(client.id, freelancer.id, outsider.id);
    const p = await createProject(client, {
      title: 'Integration project',
      description: 'Real PostgreSQL workflow test',
      freelancerEmail: freelancer.email,
    });
    const m = await createMilestone(client, p.id, {
      title: 'Artifact milestone',
      description: 'Verify agreed artifact content',
      amount: '12.34',
      currency: 'USD',
      dueDate: '2026-11-10',
      requirements: [
        {
          description: 'Contains agreed string',
          method: 'TEXT_CONTAINS',
          expected: 'ready',
          evidenceRequired: 'Text artifact',
        },
      ],
    });
    await expect(getProject(outsider, p.id)).rejects.toThrow('Project not found');
    await expect(createOrder(client, m.id)).rejects.toThrow('acceptance');
    await editSpecification(client, m.id, {
      revision: 0,
      requirements: [
        {
          description: 'Contains agreed string version two',
          method: 'TEXT_CONTAINS',
          expected: 'ready',
          evidenceRequired: 'Text artifact',
        },
      ],
    });
    let current = await db.milestone.findUniqueOrThrow({
      where: { id: m.id },
      include: {
        specifications: { orderBy: { version: 'desc' }, include: { requirements: true } },
      },
    });
    expect(current.currentVersion).toBe(2);
    expect(current.specifications).toHaveLength(2);
    await agree(client, m.id, 1);
    await expect(agree(freelancer, m.id, 1)).rejects.toThrow('changed');
    await agree(freelancer, m.id, 2);
    await expect(
      editSpecification(client, m.id, {
        revision: 3,
        requirements: [
          {
            description: 'Alter scope',
            method: 'MANUAL',
            expected: '',
            evidenceRequired: 'review',
          },
        ],
      }),
    ).rejects.toThrow('immutable');
    const req = current.specifications[0].requirements[0];
    function form(content: string, revision: number) {
      const data = new FormData();
      data.set('revision', String(revision));
      data.set('notes', 'Integration test submission');
      data.append('files', new File([content], 'proof.txt', { type: 'text/plain' }));
      data.append('requirementIds', req.id);
      return data;
    }
    await expect(submitEvidence(client, m.id, form('ready', 3))).rejects.toThrow('freelancer');
    await submitEvidence(freelancer, m.id, form('incomplete', 3));
    await expect(submitEvidence(freelancer, m.id, form('ready', 3))).rejects.toThrow();
    const fail = await verifySubmission(client, m.id);
    expect((fail.results as { status: string }[])[0].status).toBe('fail');
    await expect(decide(freelancer, m.id, 'ACCEPTED', 'Self acceptance', 5)).rejects.toThrow(
      'client',
    );
    await decide(client, m.id, 'REVISION_REQUESTED', 'Please include the agreed string.', 5);
    await submitEvidence(freelancer, m.id, form('ready', 6));
    const pass = await verifySubmission(client, m.id);
    expect((pass.results as { status: string }[])[0].status).toBe('pass');
    await decide(client, m.id, 'ACCEPTED', 'Reviewed the artifact and accepted.', 8);
    current = await db.milestone.findUniqueOrThrow({
      where: { id: m.id },
      include: {
        specifications: { orderBy: { version: 'desc' }, include: { requirements: true } },
      },
    });
    expect(current.status).toBe('ACCEPTED');
    expect(await db.payment.count({ where: { milestoneId: m.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { projectId: p.id } })).toBeGreaterThan(8);
    expect(await db.submission.count({ where: { milestoneId: m.id } })).toBe(2);
  }, 30000);
});
