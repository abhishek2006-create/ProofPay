import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';
import { createProject, createMilestone, agree } from '../src/lib/projects';
import { submitEvidence, verifySubmission } from '../src/lib/submissions';

afterAll(() => db.$disconnect());
afterEach(() => vi.unstubAllEnvs());
describe.skipIf(
  !(process.env.PROOFPAY_TEST_PYTHON_URL ?? process.env.AI_SERVICE_URL) ||
    !process.env.DATABASE_URL,
)('live Python and PostgreSQL workflow', () => {
  it('stores a Python evaluation through the real submission and review backend', async () => {
    vi.stubEnv(
      'AI_SERVICE_URL',
      (process.env.PROOFPAY_TEST_PYTHON_URL ?? process.env.AI_SERVICE_URL)!,
    );
    vi.stubEnv(
      'AI_SERVICE_TOKEN',
      (process.env.PROOFPAY_TEST_PYTHON_TOKEN ?? process.env.AI_SERVICE_TOKEN)!,
    );
    vi.stubEnv('AI_API_KEY', '');
    const stamp = crypto.randomUUID();
    const client = await db.user.create({
      data: {
        name: 'Python client',
        email: `py-c-${stamp}@example.test`,
        role: 'CLIENT',
        passwordHash: 'disabled',
      },
    });
    const worker = await db.user.create({
      data: {
        name: 'Python freelancer',
        email: `py-f-${stamp}@example.test`,
        role: 'FREELANCER',
        passwordHash: 'disabled',
      },
    });
    const project = await createProject(client, {
      title: 'Python integration',
      description: 'Verify service integration',
      freelancerEmail: worker.email,
    });
    const milestone = await createMilestone(client, project.id, {
      title: 'Deliver text',
      description: 'Provide the agreed text artifact',
      amount: '20.00',
      currency: 'USD',
      dueDate: '2027-12-10',
      requirements: [
        {
          description: 'Artifact includes agreed text',
          method: 'TEXT_CONTAINS',
          expected: 'Hello ProofPay',
          evidenceRequired: 'Text artifact',
          weight: 1,
        },
        {
          description: 'Runtime works',
          method: 'SANDBOX_TEST',
          expected: 'approved-runtime',
          evidenceRequired: 'Isolated runtime evidence',
          weight: 1,
        },
      ],
    });
    await agree(client, milestone.id, 0);
    await agree(worker, milestone.id, 1);
    const criterion = await db.requirement.findFirstOrThrow({
      where: { specification: { milestoneId: milestone.id }, method: 'TEXT_CONTAINS' },
    });
    const form = new FormData();
    form.set('revision', '2');
    form.set('notes', 'Integration test artifact');
    form.append('files', new File(['Hello ProofPay'], 'evidence.txt', { type: 'text/plain' }));
    form.append('requirementIds', criterion.id);
    await submitEvidence(worker, milestone.id, form);
    const run = await verifySubmission(client, milestone.id);
    const report = run.report as {
      evaluationEngine: string;
      overall: { scoreOutOf10: number; provisional: boolean };
      testing: { status: string };
      limitations: string[];
    };
    expect(report.overall).toMatchObject({ scoreOutOf10: 5, provisional: true });
    expect(report.evaluationEngine).toBe('python');
    expect(report.testing.status).toBe('TEST_EXECUTION_UNAVAILABLE');
    expect(report.limitations).toContain(
      'Runtime results require an externally provisioned and audited runner.',
    );
    expect(
      (await db.evaluationJob.findFirstOrThrow({ where: { milestoneId: milestone.id } })).status,
    ).toBe('COMPLETED');
    expect(await db.payment.count({ where: { milestoneId: milestone.id } })).toBe(0);
  }, 30000);
});
