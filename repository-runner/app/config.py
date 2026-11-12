import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SuiteDefinition:
    digest: str
    image: str
    bundle: str
    kind: str
    case_name: str
    prepare_dependencies: bool


@dataclass(frozen=True)
class Settings:
    token: str
    github_token: str
    suites: dict[str, dict[str, SuiteDefinition]]
    max_jobs: int

    @classmethod
    def from_env(cls):
        raw = json.loads(os.getenv("RUNNER_SUITE_REGISTRY_JSON", "{}"))
        if not isinstance(raw, dict):
            raise ValueError("RUNNER_SUITE_REGISTRY_JSON must be an object")
        suites = {}
        for project_id, project_suites in raw.items():
            if not isinstance(project_id, str) or not isinstance(project_suites, dict):
                raise ValueError("Invalid suite registry")
            suites[project_id] = {}
            for suite_id, item in project_suites.items():
                if not isinstance(suite_id, str) or not isinstance(item, dict):
                    raise ValueError("Invalid suite definition")
                definition = SuiteDefinition(
                    digest=str(item.get("digest", "")),
                    image=str(item.get("image", "")),
                    bundle=str(item.get("bundle", "")),
                    kind=str(item.get("kind", "test")),
                    case_name=str(item.get("caseName", suite_id)),
                    prepare_dependencies=bool(item.get("prepareDependencies", False)),
                )
                if not definition.digest.startswith("sha256:") or "@sha256:" not in definition.image:
                    raise ValueError("Every suite needs a SHA-256 bundle digest and pinned image")
                if definition.kind not in {"test", "build", "lint", "typecheck"}:
                    raise ValueError("Unsupported suite command kind")
                suites[project_id][suite_id] = definition
        return cls(
            token=os.getenv("RUNNER_TOKEN", ""),
            github_token=os.getenv("RUNNER_GITHUB_TOKEN", ""),
            suites=suites,
            max_jobs=int(os.getenv("RUNNER_MAX_JOBS", "2")),
        )
