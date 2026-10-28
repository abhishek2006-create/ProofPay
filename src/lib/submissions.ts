import { createHash } from 'node:crypto';
import { db } from './db';
import { ensure } from './errors';
import { audit, assertClient, getMilestone, type Actor } from './projects';
import { resolveRepository } from './agents/repository-agent';

export function inspectFile(file: { name: string; type: string }, bytes: Uint8Array) {
  ensure(
    bytes.length > 0 && bytes.length <= 1024 * 1024,
    400,
    'Each file must be between 1 byte and 1 MB.',
  );
  ensure(file.name.length <= 150 && !/[\\/\x00-\x1f]/.test(file.name), 400, 'Invalid filename.');
  const buf = Buffer.from(bytes);
  const text = buf.toString('utf8');
  if (file.type === 'image/png') {
    ensure(
      buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      400,
      'File content is not a PNG image.',
    );
    return;
  }
  ensure(
    ['text/plain', 'application/json'].includes(file.type),
    400,
    'Use plain text, JSON or PNG evidence.',
  );
  ensure(!buf.includes(0) && !text.includes('\uFFFD'), 400, 'Text evidence must be valid UTF-8.');
  if (file.type === 'application/json') {
    try {
      JSON.parse(text);
    } catch {
      ensure(false, 400, 'The JSON evidence is malformed.');
    }
  }
}
export async function submitEvidence(user: Actor, id: string, form: FormData) {
  const m = await getMilestone(user, id);
  ensure(
    user.id === m.project.freelancerId && user.role === 'FREELANCER',
    403,
    'Only the assigned freelancer can submit evidence.',
  );
  ensure(
    ['AGREED', 'REVISION_REQUESTED'].includes(m.status),
    409,
    'Evidence can only be submitted after agreement or a revision request.',
  );
  const revision = Number(form.get('revision'));
  ensure(Number.isInteger(revision), 400, 'Revision is required.');
  const notes = String(form.get('notes') ?? '').trim();
  ensure(notes.length <= 5000, 400, 'Submission notes are too long.');
  const entries = form.getAll('files');
  const repositoryUrl = String(form.get('repositoryUrl') ?? '').trim();
  const setupInstructions = String(form.get('setupInstructions') ?? '');
  ensure(setupInstructions.length <= 3000, 400, 'Setup instructions are too long.');
  let pinned:
    | { repositoryUrl: string; repositoryRef: string; commitSha: string; treeSha: string }
    | undefined;
  if (repositoryUrl) {
    ensure(
      form.get('repositoryConsent') === 'true',
      400,
      'Confirm authorization to inspect this repository.',
    );
    pinned = await resolveRepository(
      m.projectId,
      repositoryUrl,
      String(form.get('repositoryRef') ?? '').trim(),
    );
  }
  const ids = form.getAll('requirementIds').map(String);
  ensure(
    (entries.length > 0 || Boolean(pinned)) &&
      entries.length <= 10 &&
      ids.length === entries.length,
    400,
    'Submit an authorized GitHub repository or 1–10 linked evidence files.',
  );
  const requirements = m.specifications[0].requirements;
  const files: {
    requirementId: string;
    filename: string;
    mimeType: string;
    content: Uint8Array<ArrayBuffer>;
    sha256: string;
  }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i];
    ensure(file instanceof File, 400, 'Invalid evidence file.');
    ensure(
      requirements.some((r) => r.id === ids[i]),
      400,
      'Evidence must reference a current agreed criterion.',
    );
    const bytes = new Uint8Array(await file.arrayBuffer());
    inspectFile(file, bytes);
    files.push({
      requirementId: ids[i],
      filename: file.name,
      mimeType: file.type,
      content: bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.milestone.updateMany({
      where: { id, revision, status: { in: ['AGREED', 'REVISION_REQUESTED'] } },
      data: { status: 'SUBMITTED', revision: { increment: 1 } },
    });
    ensure(
      updated.count === 1,
      409,
      'Milestone changed or already submitted. Refresh before retrying.',
    );
    const submission = await tx.submission.create({
      data: {
        milestoneId: id,
        submittedBy: user.id,
        version: m.currentVersion,
        notes,
        ...pinned,
        setupInstructions,
        evidence: { create: files },
      },
    });
    await audit(tx, user.id, m.projectId, 'EVIDENCE_SUBMITTED', id, {
      submissionId: submission.id,
    });
    return submission;
  });
}
export { evaluateMilestone as verifySubmission } from './agents/orchestrator';
export async function decide(
  user: Actor,
  id: string,
  decision: 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED',
  comment: string,
  revision: number,
) {
  const m = await getMilestone(user, id);
  assertClient(user, m.project);
  ensure(
    !(await db.evaluationJob.findFirst({
      where: { milestoneId: id, status: 'RUNNING', leaseUntil: { gt: new Date() } },
    })),
    409,
    'Wait for the active evaluation before deciding.',
  );
  ensure(m.status === 'UNDER_REVIEW', 409, 'A review must run before a decision.');
  ensure(
    m.runs[0]?.submissionId === m.submissions[0]?.id,
    409,
    'Run checks on the latest submission first.',
  );
  ensure(
    comment.trim().length >= 5 && comment.length <= 3000,
    400,
    'Explain your decision in 5–3000 characters.',
  );
  return db.$transaction(async (tx) => {
    const updated = await tx.milestone.updateMany({
      where: { id, status: 'UNDER_REVIEW', revision },
      data: { status: decision, revision: { increment: 1 } },
    });
    ensure(
      updated.count === 1,
      409,
      'Another decision was recorded. Refresh to see the latest state.',
    );
    await tx.acceptanceDecision.create({
      data: { milestoneId: id, clientId: user.id, decision, comment, version: m.currentVersion },
    });
    const event = await audit(tx, user.id, m.projectId, decision, id, { comment });
    if (decision === 'ACCEPTED')
      await tx.delivery.create({
        data: {
          id: event.id,
          projectId: m.projectId,
          payload: {
            eventId: event.id,
            type: 'milestone.accepted',
            projectId: m.projectId,
            milestoneId: id,
          },
          status: 'PENDING',
        },
      });
  });
}
