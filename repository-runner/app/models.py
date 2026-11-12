from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Limits(StrictModel):
    network: Literal["disabled"]
    timeoutSeconds: int = Field(gt=0, le=90)
    memoryMb: int = Field(gt=0, le=2048)
    cpuLimit: float = Field(gt=0, le=2)
    diskMb: int = Field(gt=0, le=1024)


class RunRequest(StrictModel):
    contractVersion: Literal[2]
    requestId: str = Field(min_length=32, max_length=200)
    projectId: str = Field(min_length=1, max_length=200)
    repositoryUrl: str = Field(max_length=500)
    commitSha: str = Field(pattern=r"^[a-f0-9]{40}$")
    treeSha: str = Field(pattern=r"^[a-f0-9]{40}$")
    suites: list[str] = Field(min_length=1, max_length=30)
    suiteDigests: dict[str, str] = Field(max_length=30)
    limits: Limits

    @model_validator(mode="after")
    def unique_suites(self):
        if len(set(self.suites)) != len(self.suites) or set(self.suites) != set(self.suiteDigests):
            raise ValueError("Suite IDs and bundle digests must be unique and match")
        return self
