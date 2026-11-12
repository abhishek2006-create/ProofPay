"""Read configuration at request time; never load application/payment credentials."""
import json
import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    service_token: str = ""
    github_token: str = ""
    private_repos: dict = field(default_factory=dict)
    runner_url: str = ""
    runner_token: str = ""
    runner_approved: bool = False
    suite_registry: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls):
        def mapping(name):
            value = json.loads(os.getenv(name, "{}"))
            if not isinstance(value, dict):
                raise ValueError("Invalid service mapping")
            return value
        return cls(
            service_token=os.getenv("AI_SERVICE_TOKEN", ""),
            github_token=os.getenv("GITHUB_TOKEN", ""),
            private_repos=mapping("GITHUB_PRIVATE_PROJECT_REPOS_JSON"),
            runner_url=os.getenv("REPOSITORY_RUNNER_URL", ""),
            runner_token=os.getenv("REPOSITORY_RUNNER_TOKEN", ""),
            runner_approved=os.getenv("RUNNER_SECURITY_APPROVED") == "true",
            suite_registry=mapping("RUNNER_TRUSTED_SUITES_JSON"),
        )
