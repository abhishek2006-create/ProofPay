import pytest
from pathlib import Path
from app.bundles import digest
from app.config import Settings
from app.execution import suite_definitions, validate_repository_url
from app.models import RunRequest


def request(**changes):
    value = {"contractVersion": 2, "requestId": "a" * 32, "projectId": "project", "repositoryUrl": "https://github.com/example/demo",
             "commitSha": "b" * 40, "treeSha": "c" * 40, "suites": ["test"], "suiteDigests": {"test": "sha256:" + "d" * 64},
             "limits": {"network": "disabled", "timeoutSeconds": 90, "memoryMb": 2048, "cpuLimit": 2, "diskMb": 1024}}
    value.update(changes)
    return RunRequest.model_validate(value)


@pytest.mark.parametrize("url", ["http://github.com/a/b", "https://evil.example/a/b", "https://github.com/a/b?x=1"])
def test_rejects_noncanonical_urls(url):
    with pytest.raises(ValueError):
        validate_repository_url(url)


def test_rejects_unapproved_suite():
    settings = Settings(token="x" * 32, github_token="", suites={}, max_jobs=2)
    with pytest.raises(ValueError):
        suite_definitions(request(), settings)


def test_rejects_duplicate_suite_requests():
    with pytest.raises(Exception):
        request(suites=["test", "test"])


def test_bundle_digest_changes_with_contents(tmp_path):
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    script = bundle / "run.sh"
    script.write_text("exit 0\n")
    first = digest(bundle)
    script.write_text("exit 1\n")
    assert digest(bundle) != first


