import { createHash } from 'node:crypto';
import { z } from 'zod';
import { resultSchema, type CheckResult } from './validation';
export type RequirementInput = {
  id: string;
  description: string;
  method: string;
  expected: string;
  evidenceRequired: string;
};
export type EvidenceInput = {
  id: string;
  requirementId: string;
  filename: string;
  mimeType: string;
  content: Uint8Array;
  sha256: string;
};
export function runChecks(
  requirements: RequirementInput[],
  evidence: EvidenceInput[],
): CheckResult[] {
  return requirements.map((r) => {
    const files = evidence.filter((e) => e.requirementId === r.id);
    const base = {
      requirementId: r.id,
      evidenceIds: files.map((f) => f.id),
      method: r.method,
      limitations:
        'Checks validate only the supplied artifact, not a deployed application or its backend.',
    };
    if (!files.length)
      return {
        ...base,
        status: 'not_verified',
        explanation: 'No evidence was submitted for this criterion.',
      };
    if (files.some((f) => createHash('sha256').update(f.content).digest('hex') !== f.sha256))
      return { ...base, status: 'fail', explanation: 'Evidence integrity check failed.' };
    if (r.method === 'MANUAL')
      return {
        ...base,
        status: 'needs_review',
        explanation: 'Evidence is available. This criterion requires human review.',
      };
    const text = files
      .filter((f) => ['text/plain', 'application/json'].includes(f.mimeType))
      .map((f) => Buffer.from(f.content).toString('utf8'));
    if (!text.length)
      return {
        ...base,
        status: 'not_verified',
        explanation: 'A text or JSON artifact is required for this check.',
      };
    if (!r.expected.trim())
      return {
        ...base,
        status: 'not_verified',
        explanation: 'An explicit expected value must be agreed before this check can run.',
      };
    if (r.method === 'TEXT_CONTAINS')
      return {
        ...base,
        status: text.some((t) => t.includes(r.expected)) ? 'pass' : 'fail',
        explanation: `Executed a case-sensitive text check for the agreed string: ${r.expected}`,
      };
    if (r.method === 'JSON_VALUE') {
      const at = r.expected.indexOf('=');
      if (at < 1)
        return {
          ...base,
          status: 'not_verified',
          explanation: 'Expected JSON rule must use key=value format.',
        };
      const key = r.expected.slice(0, at),
        expected = r.expected.slice(at + 1);
      const matches = text.some((t) => {
        try {
          const data = JSON.parse(t);
          return Object.hasOwn(data, key) && String(data[key]) === expected;
        } catch {
          return false;
        }
      });
      return {
        ...base,
        status: matches ? 'pass' : 'fail',
        explanation: `Parsed JSON artifacts and compared top-level field ${key} to ${expected}.`,
      };
    }
    return { ...base, status: 'not_verified', explanation: 'No supported verifier is configured.' };
  });
}
export const aiReviewSchema = z
  .object({ summary: z.string().max(2000), results: z.array(resultSchema).max(30) })
  .strict();
export function validateAiReview(value: unknown, checks: CheckResult[]) {
  const report = aiReviewSchema.parse(value);
  const ids = new Set<string>();
  for (const item of report.results) {
    const check = checks.find((c) => c.requirementId === item.requirementId);
    if (!check || ids.has(item.requirementId))
      throw new Error('Unknown or duplicate criterion in AI response.');
    ids.add(item.requirementId);
    if (item.evidenceIds.some((id) => !check.evidenceIds.includes(id)))
      throw new Error('Unsupported evidence reference.');
    if (new Set(item.evidenceIds).size !== item.evidenceIds.length)
      throw new Error('Duplicate evidence references.');
    if (
      check.method === 'MANUAL' &&
      check.status === 'needs_review' &&
      item.status !== 'needs_review'
    )
      throw new Error('Manual evidence requires human review.');
    if (!check.evidenceIds.length && item.status !== 'not_verified')
      throw new Error('Missing evidence must remain not verified.');
    if (item.method !== check.method) throw new Error('AI cannot change the verification method.');
    if (item.status === 'pass' && (check.status !== 'pass' || !item.evidenceIds.length))
      throw new Error('AI cannot promote an unverified or failed check to passed.');
    if (check.status === 'fail' && item.status !== 'fail')
      throw new Error('AI cannot override a deterministic failure.');
  }
  if (ids.size !== checks.length) throw new Error('AI response must cover every criterion.');
  return report;
}
