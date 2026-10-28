import { z } from 'zod';
export const credentialsSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const registerSchema = credentialsSchema
  .extend({ name: z.string().trim().min(2).max(80), role: z.enum(['CLIENT', 'FREELANCER']) })
  .strict();
export const requirementSchema = z
  .object({
    description: z.string().trim().min(3).max(500),
    method: z.enum(['TEXT_CONTAINS', 'JSON_VALUE', 'MANUAL', 'REPO_FILE', 'SANDBOX_TEST']),
    expected: z.string().max(500),
    evidenceRequired: z.string().min(3).max(300),
    weight: z.number().int().min(1).max(10000).default(1),
    sourceChunkId: z.string().nullable().optional(),
    sourceQuote: z.string().max(1000).nullable().optional(),
  })
  .strict();
export const projectSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(5).max(3000),
    freelancerEmail: z.email().transform((s) => s.toLowerCase()),
  })
  .strict();
export function parseAmount(value: string): number {
  if (!/^(?:0|[1-9]\d{0,5})\.\d{2}$/.test(value))
    throw new Error('Use an amount such as 450.00, with two decimal places.');
  const [whole, fraction] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction);
  if (amount < 100 || amount > 10000000)
    throw new Error('Amount must be between 1.00 and 100000.00.');
  return amount;
}
export function formatAmount(minor: number) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}
export function parseTip(value: string): number {
  if (!/^(?:0|[1-9]\d{0,5})\.\d{2}$/.test(value))
    throw new Error('Tip must be a non-negative amount with two decimals.');
  const [whole, part] = value.split('.');
  const tip = Number(whole) * 100 + Number(part);
  if (tip > 10000000) throw new Error('Tip exceeds the supported limit.');
  return tip;
}
export const milestoneSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(5).max(3000),
    amount: z.string().refine((s) => {
      try {
        parseAmount(s);
        return true;
      } catch {
        return false;
      }
    }, 'Use 1.00–100000.00 with two decimals.'),
    currency: z.enum(['USD', 'EUR', 'GBP']),
    dueDate: z.iso.date(),
    requirements: z.array(requirementSchema).min(1).max(30),
  })
  .strict();
export const resultSchema = z
  .object({
    requirementId: z.string(),
    status: z.enum(['pass', 'fail', 'needs_review', 'not_verified']),
    explanation: z.string().max(1500),
    evidenceIds: z.array(z.string()).max(30),
    method: z.string(),
    limitations: z.string().max(1000),
  })
  .strict();
export type CheckResult = z.infer<typeof resultSchema>;
