import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser, requireUser } from '@/lib/auth';
import { checkOrigin, jsonBody, rateLimit, evidenceForm } from '@/lib/security';
import { AppError, ensure } from '@/lib/errors';
import { registerSchema } from '@/lib/validation';
import {
  agree,
  createMilestone,
  createProject,
  editSpecification,
  getProject,
  membership,
  projectInclude,
} from '@/lib/projects';
import { decide, submitEvidence, verifySubmission } from '@/lib/submissions';
import { aiConfigured, proposeCriteria, diagnoseAi } from '@/lib/ai';
import { publicAiConfig } from '@/lib/ai-config';
import {
  uploadRequirements,
  retrieveRequirements,
  groundedCriteria,
} from '@/lib/agents/requirements-agent';
import { paypalConfigured } from '@/lib/paypal';
import {
  cancelPayment,
  capturePayment,
  createOrder,
  processWebhook,
  reconcilePayment,
} from '@/lib/payments';
import {
  deliverNotifications,
  elasticConfigured,
  indexProject,
  searchEvidence,
} from '@/lib/integrations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path;
    const [resource, id, action] = path;
    const method = req.method;
    if (resource === 'health' && method === 'GET') {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ status: 'ok' });
    }
    if (resource === 'paypal-webhook' && method === 'POST')
      return NextResponse.json(await processWebhook(req.headers, await jsonBody(req)));
    if (method !== 'GET') checkOrigin(req);
    if (resource === 'register' && method === 'POST') {
      const data = registerSchema.parse(await jsonBody(req));
      await rateLimit('registration:global', 30, 3600000);
      await rateLimit(`register:${data.email}`, 3, 3600000);
      ensure(
        !(await db.user.findUnique({ where: { email: data.email } })),
        409,
        'An account with this email already exists.',
      );
      const user = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: await hash(data.password, 12),
          role: data.role,
        },
      });
      return NextResponse.json({ id: user.id }, { status: 201 });
    }
    if (resource === 'me' && method === 'GET') {
      const user = await currentUser();
      return NextResponse.json({ user });
    }
    const user = await requireUser();
    if (method !== 'GET') await rateLimit(`api:${user.id}`, 60);
    if (resource === 'settings') {
      if (method === 'GET')
        return NextResponse.json({
          user,
          services: {
            paypal: paypalConfigured(),
            ai: aiConfigured(),
            elastic: elasticConfigured(),
            zapier: Boolean(process.env.ZAPIER_WEBHOOK_URL),
          },
          merchantId: process.env.PAYPAL_MERCHANT_ID || null,
          aiModel: publicAiConfig(),
        });
      if (method === 'PATCH') {
        const data = z
          .object({ zapierConsent: z.boolean(), elasticConsent: z.boolean() })
          .strict()
          .parse(await jsonBody(req));
        await db.user.update({ where: { id: user.id }, data });
        return NextResponse.json({ saved: true });
      }
    }
    if (resource === 'projects') {
      if (method === 'GET' && !id) {
        const projects = await db.project.findMany({
          where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
          orderBy: { createdAt: 'desc' },
          include: projectInclude,
        });
        return NextResponse.json({ projects });
      }
      if (method === 'POST' && !id)
        return NextResponse.json(await createProject(user, await jsonBody(req)), { status: 201 });
      if (method === 'GET' && id && !action) return NextResponse.json(await getProject(user, id));
      if (method === 'POST' && action === 'milestones')
        return NextResponse.json(await createMilestone(user, id, await jsonBody(req)), {
          status: 201,
        });
      if (method === 'POST' && action === 'documents')
        return NextResponse.json(await uploadRequirements(user, id, await evidenceForm(req)), {
          status: 201,
        });
      if (method === 'GET' && action === 'requirements') {
        const url = new URL(req.url);
        return NextResponse.json(
          await retrieveRequirements(
            user,
            id,
            url.searchParams.get('q') ?? '',
            url.searchParams.get('milestoneId') ?? undefined,
          ),
        );
      }
      if (method === 'POST' && action === 'extract-criteria') {
        await rateLimit(`rag-criteria:${user.id}`, 5, 60000);
        const data = z
          .object({
            query: z.string().min(2).max(4000),
            milestoneId: z.string().optional(),
            consent: z.literal(true),
          })
          .strict()
          .parse(await jsonBody(req));
        return NextResponse.json(await groundedCriteria(user, id, data.query, data.milestoneId));
      }
      if (method === 'POST' && action === 'index')
        return NextResponse.json(await indexProject(user, id));
      if (method === 'POST' && action === 'notify')
        return NextResponse.json(await deliverNotifications(user, id));
    }
    if (resource === 'search' && method === 'GET')
      return NextResponse.json(
        await searchEvidence(
          user,
          z.string().min(2).max(200).parse(new URL(req.url).searchParams.get('q')),
        ),
      );
    if (resource === 'ai' && id === 'diagnostic' && method === 'POST') {
      const data = z
        .object({ confirm: z.literal(true) })
        .strict()
        .parse(await jsonBody(req));
      if (data.confirm) await rateLimit(`ai-diagnostic:${user.id}`, 3, 60000);
      return NextResponse.json(await diagnoseAi());
    }
    if (resource === 'ai' && id === 'criteria' && method === 'POST') {
      await rateLimit(`ai:${user.id}`, 5, 60000);
      const data = z
        .object({ description: z.string().min(10).max(3000), consent: z.literal(true) })
        .strict()
        .parse(await jsonBody(req));
      return NextResponse.json(await proposeCriteria(data.description));
    }
    if (resource === 'milestones' && id) {
      if (action === 'evaluation' && method === 'GET') {
        const m = await db.milestone.findUnique({ where: { id }, include: { project: true } });
        ensure(m, 404, 'Milestone not found.');
        membership(user, m.project);
        await db.evaluationJob.updateMany({
          where: { milestoneId: id, status: 'RUNNING', leaseUntil: { lt: new Date() } },
          data: {
            status: 'FAILED',
            stage: 'EVALUATION_INTERRUPTED',
            error: 'Evaluation lease expired; request a new run.',
          },
        });
        return NextResponse.json({
          job: await db.evaluationJob.findFirst({
            where: { milestoneId: id },
            orderBy: { createdAt: 'desc' },
          }),
        });
      }
      if (action === 'specification' && method === 'PATCH') {
        await editSpecification(user, id, await jsonBody(req));
        return NextResponse.json({ saved: true });
      }
      if (action === 'agree' && method === 'POST') {
        const data = z
          .object({ revision: z.number().int(), confirm: z.literal(true) })
          .strict()
          .parse(await jsonBody(req));
        await agree(user, id, data.revision);
        return NextResponse.json({ agreed: true });
      }
      if (action === 'submit' && method === 'POST') {
        ensure(
          Number(req.headers.get('content-length')) > 0 &&
            Number(req.headers.get('content-length')) < 12 * 1024 * 1024,
          413,
          'Evidence request must be less than 12 MB.',
        );
        return NextResponse.json(await submitEvidence(user, id, await evidenceForm(req)), {
          status: 201,
        });
      }
      if (action === 'verify' && method === 'POST') {
        await rateLimit(`verify:${user.id}`, 10, 60000);
        return NextResponse.json(await verifySubmission(user, id));
      }
      if (action === 'decision' && method === 'POST') {
        const data = z
          .object({
            decision: z.enum(['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED']),
            comment: z.string(),
            revision: z.number().int(),
            confirm: z.literal(true),
          })
          .strict()
          .parse(await jsonBody(req));
        await decide(user, id, data.decision, data.comment, data.revision);
        return NextResponse.json({ saved: true });
      }
      if (action === 'order' && method === 'POST') {
        await rateLimit(`payment:${user.id}`, 10, 60000);
        return NextResponse.json(await createOrder(user, id, req.body ? await jsonBody(req) : {}));
      }
      if (action === 'capture' && method === 'POST')
        return NextResponse.json(await capturePayment(user, id));
      if (action === 'cancel' && method === 'POST')
        return NextResponse.json(await cancelPayment(user, id));
      if (action === 'reconcile' && method === 'POST') {
        const p = await db.milestone.findUnique({
          where: { id },
          include: { project: true, payment: true },
        });
        ensure(p?.payment, 404, 'Payment not found.');
        membership(user, p.project);
        return NextResponse.json(await reconcilePayment(p.payment.id, user.id));
      }
    }
    if (resource === 'documents' && id && method === 'GET') {
      const document = await db.projectDocument.findUnique({
        where: { id },
        include: {
          project: true,
          chunks: {
            select: { id: true, text: true, sourceLocation: true, ordinal: true },
            orderBy: { ordinal: 'asc' },
          },
        },
      });
      ensure(document, 404, 'Document not found.');
      membership(user, document.project);
      return NextResponse.json({
        id: document.id,
        filename: document.filename,
        status: document.status,
        chunks: document.chunks,
      });
    }
    if (resource === 'evidence' && id && method === 'GET') {
      const e = await db.evidence.findUnique({
        where: { id },
        include: { submission: { include: { milestone: { include: { project: true } } } } },
      });
      ensure(e, 404, 'Evidence not found.');
      membership(user, e.submission.milestone.project);
      return new Response(new Uint8Array(e.content), {
        headers: {
          'Content-Type': e.mimeType,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(e.filename)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    throw new AppError(404, 'Endpoint not found.');
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(' ') },
        { status: 400 },
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return NextResponse.json(
        { error: 'This record already exists. Refresh before retrying.' },
        { status: 409 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientInitializationError
    )
      return NextResponse.json(
        { error: 'Database unavailable. Check PostgreSQL setup and migrations.' },
        { status: 503 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'Invalid request data.' }, { status: 400 });
    return NextResponse.json(
      { error: 'The request could not be completed. Please retry or contact the operator.' },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH };
