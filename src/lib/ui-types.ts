export type UserView = {
  id: string;
  name: string;
  email: string;
  role: 'CLIENT' | 'FREELANCER';
  zapierConsent: boolean;
  elasticConsent: boolean;
};
export type RequirementView = {
  weight: number;
  sourceChunkId: string | null;
  sourceQuote: string | null;
  id: string;
  description: string;
  method: string;
  expected: string;
  evidenceRequired: string;
};
export type SpecificationView = {
  id: string;
  version: number;
  clientAgreedAt: string | null;
  freelancerAgreedAt: string | null;
  requirements: RequirementView[];
};
export type EvidenceView = {
  id: string;
  requirementId: string;
  filename: string;
  mimeType: string;
  sha256: string;
  createdAt: string;
};
export type ResultView = {
  requirementId: string;
  status: string;
  explanation: string;
  evidenceIds: string[];
  method: string;
  limitations: string;
};
export type RunView = {
  report: import('@/components/evaluation-report').EvaluationReportView | null;
  id: string;
  submissionId: string;
  summary: string;
  modelProvider: string;
  modelVersion: string | null;
  createdAt: string;
  results: ResultView[];
  aiResults: {
    summary: string;
    results: ResultView[];
    metadata?: { model: string; mode: string; promptVersion: string };
  } | null;
};
export type PaymentView = {
  baseAmountMinor: number;
  tipMinor: number;
  id: string;
  status: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  amountMinor: number;
  currency: string;
  merchantId: string;
};
export type MilestoneView = {
  evaluations: {
    id: string;
    status: string;
    stage: string;
    error: string | null;
    events: { stage: string; at: string; message: string }[];
  }[];
  id: string;
  title: string;
  description: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  status: string;
  currentVersion: number;
  revision: number;
  payment: PaymentView | null;
  specifications: SpecificationView[];
  submissions: {
    id: string;
    notes: string;
    createdAt: string;
    evidence: EvidenceView[];
    repositoryUrl: string | null;
    repositoryRef: string | null;
    commitSha: string | null;
    setupInstructions: string;
  }[];
  runs: RunView[];
  decisions: { id: string; decision: string; comment: string; createdAt: string }[];
};
export type ProjectView = {
  documents: { id: string; filename: string; status: string; _count: { chunks: number } }[];
  id: string;
  title: string;
  description: string;
  clientId: string;
  freelancerId: string;
  client: { id: string; name: string; email: string };
  freelancer: { id: string; name: string; email: string };
  milestones: MilestoneView[];
  auditEvents: {
    id: string;
    type: string;
    actorId: string;
    milestoneId: string | null;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
  createdAt: string;
};
export type SettingsView = {
  aiModel?: {
    configured: boolean;
    reason: string;
    mode: string;
    activeModel: string | null;
    pretrainedModel: string | null;
    promptVersion: string;
    responseFormat: string;
    criteriaConfigured: boolean;
  };
  user: UserView;
  services: { paypal: boolean; ai: boolean; elastic: boolean; zapier: boolean };
  merchantId: string | null;
};
