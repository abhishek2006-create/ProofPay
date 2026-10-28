-- AlterEnum
ALTER TYPE "MilestoneStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "baseAmountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN     "sourceChunkId" TEXT,
ADD COLUMN     "sourceQuote" TEXT,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "commitSha" TEXT,
ADD COLUMN     "repositoryRef" TEXT,
ADD COLUMN     "repositoryUrl" TEXT,
ADD COLUMN     "setupInstructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "treeSha" TEXT;

-- AlterTable
ALTER TABLE "VerificationRun" ADD COLUMN     "report" JSONB;

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "status" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "ordinal" INTEGER NOT NULL,
    "sourceLocation" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationJob" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "reportRunId" TEXT,
    "error" TEXT,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_milestoneId_idx" ON "ProjectDocument"("projectId", "milestoneId");

-- CreateIndex
CREATE INDEX "DocumentChunk_projectId_milestoneId_idx" ON "DocumentChunk"("projectId", "milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ordinal_key" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "EvaluationJob_milestoneId_createdAt_idx" ON "EvaluationJob"("milestoneId", "createdAt");

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_sourceChunkId_fkey" FOREIGN KEY ("sourceChunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationJob" ADD CONSTRAINT "EvaluationJob_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve pre-existing checkout totals while introducing explicit base/tip accounting.
UPDATE "Payment" SET "baseAmountMinor" = "amountMinor" WHERE "baseAmountMinor" = 0;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_total_matches_parts" CHECK ("tipMinor" >= 0 AND "baseAmountMinor" > 0 AND "amountMinor" = "baseAmountMinor" + "tipMinor");
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_positive_weight" CHECK ("weight" > 0 AND "weight" <= 10000);
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_vector_limit" CHECK (cardinality("embedding") <= 4096);
CREATE UNIQUE INDEX "EvaluationJob_one_active" ON "EvaluationJob" ("milestoneId") WHERE "status" = 'RUNNING';
CREATE OR REPLACE FUNCTION proofpay_cosine(a double precision[], b double precision[]) RETURNS double precision LANGUAGE SQL IMMUTABLE STRICT AS $$
 SELECT CASE WHEN cardinality(a) <> cardinality(b) OR cardinality(a)=0 THEN NULL ELSE
 (SELECT sum(x*y) / NULLIF(sqrt(sum(x*x))*sqrt(sum(y*y)),0) FROM unnest(a,b) pair(x,y)) END
$$;
