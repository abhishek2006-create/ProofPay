"""Versioned internal contract. Only the authenticated application may submit checks."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

SHA = Annotated[str, Field(pattern=r"^[a-f0-9]{40}$")]
ID = Annotated[str, Field(min_length=1, max_length=200)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ResolveRequest(StrictModel):
    projectId: ID
    repositoryUrl: str = Field(max_length=500)
    repositoryRef: str = Field(min_length=1, max_length=200)


class Submission(StrictModel):
    repositoryUrl: str | None = Field(default=None, max_length=500)
    commitSha: SHA | None = None
    treeSha: SHA | None = None

    @model_validator(mode="after")
    def pinned(self):
        if bool(self.repositoryUrl) != bool(self.commitSha and self.treeSha):
            raise ValueError("Repository submissions require both pinned commit and tree")
        if not self.repositoryUrl and (self.commitSha or self.treeSha):
            raise ValueError("Orphan commit/tree")
        return self


class InspectRequest(StrictModel):
    projectId: ID
    submission: Submission


class Criterion(StrictModel):
    id: ID
    description: str = Field(min_length=1, max_length=1000)
    method: Literal["TEXT_CONTAINS", "JSON_VALUE", "MANUAL", "REPO_FILE", "SANDBOX_TEST"]
    expected: str = Field(max_length=500)
    evidenceRequired: str = Field(max_length=500)
    weight: int = Field(default=1, ge=1, le=10000)
    sourceChunkId: ID | None = None
    sourceQuote: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def suite_id(self):
        if self.method == "SANDBOX_TEST" and (not self.expected.strip() or len(self.expected) > 200):
            raise ValueError("An agreed runtime suite ID of 1-200 characters is required")
        return self


class Check(StrictModel):
    requirementId: ID
    status: Literal["pass", "fail", "needs_review", "not_verified"]
    explanation: str = Field(max_length=1500)
    evidenceIds: list[ID] = Field(max_length=30)
    method: str = Field(max_length=30)
    limitations: str = Field(max_length=1000)


class EvaluationRequest(InspectRequest):
    requestId: ID
    submissionId: ID
    specificationVersion: int = Field(ge=1)
    requirements: list[Criterion] = Field(min_length=1, max_length=30)
    checks: list[Check] = Field(max_length=30)

    @model_validator(mode="after")
    def consistent(self):
        requirements = {r.id: r for r in self.requirements}
        if len(requirements) != len(self.requirements):
            raise ValueError("Duplicate criterion IDs")
        seen = set()
        for check in self.checks:
            req = requirements.get(check.requirementId)
            if not req or check.requirementId in seen or check.method != req.method:
                raise ValueError("Unknown, duplicate or mismatched artifact check")
            if check.status in ("pass", "fail") and not check.evidenceIds:
                raise ValueError("Artifact judgments require evidence")
            if len(set(check.evidenceIds)) != len(check.evidenceIds):
                raise ValueError("Duplicate evidence")
            seen.add(check.requirementId)
        return self


class Isolation(StrictModel):
    nonRoot: Literal[True]
    network: Literal["disabled"]
    productionSecrets: Literal[False]
    privileged: Literal[False]
    hostSocket: Literal[False]
    sourceReadOnly: Literal[True]
    cpuLimit: float = Field(gt=0, le=2)
    memoryMb: int = Field(gt=0, le=2048)
    timeoutSeconds: int = Field(gt=0, le=90)
    diskMb: int = Field(gt=0, le=1024)


class Command(StrictModel):
    command: str = Field(min_length=1, max_length=500)
    kind: Literal["test", "build", "lint", "typecheck"]
    exitCode: int | None
    durationMs: float = Field(ge=0, le=90000, allow_inf_nan=False)
    stdout: str = Field(max_length=10000)
    stderr: str = Field(max_length=10000)


class Case(StrictModel):
    name: str = Field(min_length=1, max_length=300)
    status: Literal["pass", "fail", "skip"]


class Suite(StrictModel):
    id: ID
    digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    commandIndex: int = Field(ge=0, le=11)
    cases: list[Case] = Field(max_length=500)


class RunnerReport(StrictModel):
    contractVersion: Literal[2]
    requestId: ID
    projectId: ID
    repositoryUrl: str = Field(max_length=500)
    commitSha: SHA
    treeSha: SHA
    status: Literal["COMPLETED", "SETUP_FAILED", "TIMEOUT"]
    isolation: Isolation
    commands: list[Command] = Field(max_length=12)
    suites: list[Suite] = Field(max_length=30)
