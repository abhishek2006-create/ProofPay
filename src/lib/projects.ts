import type { Prisma, Role } from '@prisma/client';
import { db } from './db';
import { ensure } from './errors';
import { milestoneSchema, parseAmount, projectSchema, requirementSchema } from './validation';
import { z } from 'zod';
import { validateSources } from './agents/requirements-agent';
export type Actor = { id: string; role: Role };
export const projectInclude = {
  documents: {
    select: {
      id: true,
      filename: true,
      status: true,
      milestoneId: true,
      createdAt: true,
      embeddingModel: true,
      _count: { select: { chunks: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  client: { select: { id: true, name: true, email: true } },
  freelancer: { select: { id: true, name: true, email: true } },
  milestones: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      payment: true,
      evaluations: { orderBy: { createdAt: 'desc' as const }, take: 1 },
      specifications: { orderBy: { version: 'desc' as const }, include: { requirements: true } },
      submissions: {
        orderBy: { createdAt: 'desc' as const },
        include: {
          evidence: {
            select: {
              id: true,
              requirementId: true,
              filename: true,
              mimeType: true,
              sha256: true,
              createdAt: true,
            },
          },
        },
      },
      runs: { orderBy: { createdAt: 'desc' as const } },
      decisions: { orderBy: { createdAt: 'desc' as const } },
    },
  },
  auditEvents: { orderBy: { createdAt: 'desc' as const }, take: 100 },
};
export function membership(user: Actor, p: { clientId: string; freelancerId: string }) {
  ensure(p.clientId === user.id || p.freelancerId === user.id, 404, 'Project not found.');
}
export async function getProject(user: Actor, id: string) {
  const p = await db.project.findUnique({ where: { id }, include: projectInclude });
  ensure(p, 404, 'Project not found.');
  membership(user, p);
  return p;
}
export async function getMilestone(user: Actor, id: string) {
  const m = await db.milestone.findUnique({
    where: { id },
    include: {
      project: true,
      payment: true,
      specifications: { orderBy: { version: 'desc' }, include: { requirements: true } },
      submissions: { orderBy: { createdAt: 'desc' }, include: { evidence: true } },
      runs: { orderBy: { createdAt: 'desc' } },
    },
  });
  ensure(m, 404, 'Milestone not found.');
  membership(user, m.project);
  return m;
}
export function assertClient(user: Actor, p: { clientId: string }) {
  ensure(
    user.role === 'CLIENT' && p.clientId === user.id,
    403,
    'Only the project client can perform this action.',
  );
}
export function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
  type: string,
  milestoneId?: string,
  metadata: Prisma.InputJsonValue = {},
) {
  return tx.auditEvent.create({ data: { actorId, projectId, type, milestoneId, metadata } });
}
export async function createProject(user: Actor, input: unknown) {
  ensure(user.role === 'CLIENT', 403, 'Only clients can create projects.');
  const data = projectSchema.parse(input);
  const freelancer = await db.user.findUnique({ where: { email: data.freelancerEmail } });
  ensure(
    freelancer?.role === 'FREELANCER',
    400,
    'Ask your freelancer to create an account first, then enter their email.',
  );
  return db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        title: data.title,
        description: data.description,
        clientId: user.id,
        freelancerId: freelancer.id,
      },
    });
    await audit(tx, user.id, p.id, 'PROJECT_CREATED');
    return p;
  });
}
export async function createMilestone(user: Actor, projectId: string, input: unknown) {
  const p = await getProject(user, projectId);
  assertClient(user, p);
  const data = milestoneSchema.parse(input);
  await validateSources(projectId, data.requirements);
  return db.$transaction(async (tx) => {
    const m = await tx.milestone.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        amountMinor: parseAmount(data.amount),
        currency: data.currency,
        dueDate: new Date(data.dueDate),
        specifications: { create: { version: 1, requirements: { create: data.requirements } } },
      },
    });
    await audit(tx, user.id, projectId, 'MILESTONE_CREATED', m.id);
    return m;
  });
}
export async function editSpecification(user: Actor, id: string, input: unknown) {
  const data = z
    .object({ requirements: z.array(requirementSchema).min(1).max(30), revision: z.number().int() })
    .strict()
    .parse(input);
  const m = await getMilestone(user, id);
  assertClient(user, m.project);
  await validateSources(m.projectId, data.requirements, m.id);
  ensure(
    m.status === 'DRAFT',
    409,
    'Agreed specifications are immutable. Create a new milestone for a scope change.',
  );
  return db.$transaction(async (tx) => {
    const updated = await tx.milestone.updateMany({
      where: { id, status: 'DRAFT', revision: data.revision },
      data: { currentVersion: { increment: 1 }, revision: { increment: 1 } },
    });
    ensure(updated.count === 1, 409, 'This milestone changed. Refresh and try again.');
    await tx.specification.create({
      data: {
        milestoneId: id,
        version: m.currentVersion + 1,
        requirements: { create: data.requirements },
      },
    });
    await audit(tx, user.id, m.projectId, 'SPECIFICATION_VERSIONED', id, {
      version: m.currentVersion + 1,
    });
  });
}
export async function agree(user: Actor, id: string, revision: number) {
  const m = await getMilestone(user, id);
  ensure(m.status === 'DRAFT', 409, 'Milestone is already agreed.');
  const spec = m.specifications[0];
  return db.$transaction(async (tx) => {
    const lock = await tx.milestone.updateMany({
      where: { id, revision, status: 'DRAFT' },
      data: { revision: { increment: 1 } },
    });
    ensure(lock.count === 1, 409, 'Milestone changed. Please refresh.');
    const updated = await tx.specification.update({
      where: { id: spec.id },
      data:
        user.id === m.project.clientId
          ? { clientAgreedAt: new Date() }
          : { freelancerAgreedAt: new Date() },
    });
    if (updated.clientAgreedAt && updated.freelancerAgreedAt)
      await tx.milestone.update({ where: { id }, data: { status: 'AGREED' } });
    await audit(tx, user.id, m.projectId, 'SPECIFICATION_AGREED', id, {
      version: m.currentVersion,
    });
  });
}
