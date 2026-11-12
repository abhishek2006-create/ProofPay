import asyncio
import base64
import copy
import hashlib
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app, client
from app.config import Settings
from app.agents.github_agent import GitHubAgent, parse_repository, safe_path
from app.agents.evaluation_agent import score_criteria
from app.runner import execute_tests, validate_report
from app.schemas.verification import EvaluationRequest, Submission

SHA, TREE = "a" * 40, "b" * 40
URL = "https://github.com/example/demo"
DIGEST = "sha256:" + "c" * 64
TOKEN = "test-service-token-" + "x" * 32


def requirement(**changes):
    return {"id": "r", "description": "Agreed criterion", "method": "REPO_FILE", "expected": "src/index.ts", "evidenceRequired": "Pinned file", **changes}


def request(**changes):
    return {"requestId": "job-1", "projectId": "project-1", "submissionId": "submission-1", "specificationVersion": 1,
            "submission": {"repositoryUrl": URL, "commitSha": SHA, "treeSha": TREE},
            "requirements": [requirement()], "checks": [], **changes}


def github_response(req, private=False, truncated=False):
    data = b'{"dependencies":{"react":"1"},"scripts":{"test":"DO NOT EXECUTE"}}'
    blob_sha = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
    path = req.url.path
    if path.endswith("/repos/example/demo"):
        return httpx.Response(200, json={"full_name": "example/demo", "private": private})
    if "/commits/" in path:
        return httpx.Response(200, json={"sha": SHA, "commit": {"tree": {"sha": TREE}}})
    if "/git/trees/" in path:
        return httpx.Response(200, json={"sha": TREE, "truncated": truncated, "tree": [
            {"path": "package.json", "type": "blob", "mode": "100644", "sha": blob_sha, "size": len(data)},
            {"path": "src/index.ts", "type": "blob", "mode": "100644", "sha": blob_sha, "size": len(data)},
            {"path": ".env", "type": "blob", "mode": "100644", "sha": "d" * 40, "size": 5},
            {"path": "link.ts", "type": "blob", "mode": "120000", "sha": "e" * 40, "size": 5}]})
    return httpx.Response(200, json={"sha": blob_sha, "encoding": "base64", "size": len(data), "content": base64.b64encode(data).decode()})


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("RUNNER_SECURITY_APPROVED", "false")
    async def mock_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(github_response)) as session:
            yield session
    app.dependency_overrides[client] = mock_client
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth():
    return {"Authorization": f"Bearer {TOKEN}"}


def test_service_auth_and_limits(api):
    assert api.get("/health").status_code == 200
    assert api.post("/v1/status").status_code == 401
    assert api.post("/v1/status", headers=auth()).json()["runnerConfigured"] is False
    assert api.post("/v1/evaluations", json=request()).status_code == 401
    assert api.post("/v1/evaluations", headers=auth(), content=b"x" * 256001).status_code == 413
    assert api.post("/v1/evaluations", headers=auth(), json=request(requirements=[requirement(), requirement()])).status_code == 422
    assert api.post("/v1/evaluations", headers=auth(), json={**request(), "command": "evil"}).status_code == 422


def test_resolve_inspect_evaluate_pipeline(api):
    pinned = api.post("/v1/repositories/resolve", headers=auth(), json={"projectId": "project-1", "repositoryUrl": URL, "repositoryRef": "main"})
    assert pinned.status_code == 200
    assert pinned.json()["commitSha"] == SHA
    response = api.post("/v1/evaluations", headers=auth(), json=request(requirements=[requirement(), requirement(id="runtime", method="SANDBOX_TEST", expected="login")]))
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["repository"]["paths"] == ["package.json", "src/index.ts"]
    assert report["repository"]["frameworks"] == ["React"]
    assert report["scoring"]["scoreOutOf10"] == 5
    assert report["scoring"]["verifiedWeightPercent"] == 50
    assert report["scoring"]["criteria"][1]["status"] == "BLOCKED"
    assert report["tests"]["commands"] == []


@pytest.mark.parametrize("url", ["http://github.com/x/y", "https://github.com.evil/x/y", "https://user@github.com/x/y", "https://github.com/x/y?a=1", "https://github.com/../y", "https://github.com/x/y/tree/main", "https://github.com/x/%2e%2e"])
def test_invalid_urls(url):
    with pytest.raises(Exception):
        parse_repository(url)


@pytest.mark.parametrize("path", [".env", "x/.env.local", "../x", "x\\a", "id_rsa", "secret.json", "cert.pem", "node_modules/x.js", "\x00foo"])
def test_secret_paths(path):
    assert not safe_path(path)


def test_private_authorization_and_commit_tree_binding():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: github_response(r, private=True))) as session:
            agent = GitHubAgent(session, Settings(private_repos={"allowed": ["example/demo"]}))
            with pytest.raises(Exception, match="not authorized"):
                await agent.resolve("other", URL, "main")
            with pytest.raises(Exception, match="mismatch"):
                await agent.inspect("allowed", Submission(repositoryUrl=URL, commitSha=SHA, treeSha="d" * 40))
    asyncio.run(run())


def test_blob_integrity():
    def corrupt(req):
        response = github_response(req)
        if "/git/blobs/" in req.url.path:
            obj = response.json()
            obj["content"] = base64.b64encode(b"fabricated").decode()
            return httpx.Response(200, json=obj)
        return response
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(corrupt)) as session:
            with pytest.raises(Exception, match="blob content"):
                await GitHubAgent(session, Settings()).inspect("p", Submission(repositoryUrl=URL, commitSha=SHA, treeSha=TREE))
    asyncio.run(run())


def runner_request():
    return {"contractVersion": 2, "requestId": "nonce", "projectId": "project-1", "repositoryUrl": URL,
            "commitSha": SHA, "treeSha": TREE, "suites": ["login"]}


def runner_report():
    return {**{k: v for k, v in runner_request().items() if k != "suites"}, "status": "COMPLETED",
            "isolation": {"nonRoot": True, "network": "disabled", "productionSecrets": False, "privileged": False,
                          "hostSocket": False, "sourceReadOnly": True, "cpuLimit": 2, "memoryMb": 2048, "timeoutSeconds": 90, "diskMb": 1024},
            "commands": [{"command": "trusted login tests", "kind": "test", "exitCode": 0, "durationMs": 1, "stdout": "", "stderr": ""}],
            "suites": [{"id": "login", "digest": DIGEST, "commandIndex": 0, "cases": [{"name": "valid login", "status": "pass"}]}]}


@pytest.mark.parametrize("key,value", [("requestId", "replayed"), ("projectId", "other"), ("commitSha", "e" * 40), ("treeSha", "e" * 40), ("repositoryUrl", "https://github.com/other/repo"), ("contractVersion", 1)])
def test_runner_identity_rejection(key, value):
    report = runner_report()
    report[key] = value
    with pytest.raises(ValueError):
        validate_report(report, runner_request(), {"login": DIGEST})


@pytest.mark.parametrize("mutation", ["unsafe", "bundle", "exit", "duplicate", "missing_command", "unknown_suite", "null_exit", "unattributed"])
def test_runner_forged_evidence_rejection(mutation):
    report = runner_report()
    if mutation == "unsafe": report["isolation"]["network"] = "enabled"
    if mutation == "bundle": report["suites"][0]["digest"] = "sha256:" + "f" * 64
    if mutation == "exit": report["commands"][0]["exitCode"] = 1
    if mutation == "duplicate": report["suites"] *= 2
    if mutation == "missing_command": report["commands"] = []
    if mutation == "unknown_suite": report["suites"][0]["id"] = "invented"
    if mutation == "null_exit": report["commands"][0]["exitCode"] = None
    if mutation == "unattributed": report["commands"].append(copy.deepcopy(report["commands"][0]))
    with pytest.raises(ValueError):
        validate_report(report, runner_request(), {"login": DIGEST})


def test_runner_remote_binding_and_redaction():
    async def run():
        def response(req):
            body = json.loads(req.content)
            report = runner_report()
            report["requestId"] = body["requestId"]
            report["commands"][0]["stdout"] = "private-token Bearer abc"
            assert "github_token" not in body and body["suiteDigests"] == {"login": DIGEST}
            return httpx.Response(200, json=report)
        settings = Settings(runner_url="https://runner.example/run", runner_token="private-token", runner_approved=True, suite_registry={"project-1": {"login": DIGEST}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as session:
            repo = {"status": "INSPECTED", "repositoryUrl": URL, "commitSha": SHA, "treeSha": TREE}
            result = await execute_tests(session, settings, "project-1", repo, ["login"])
            assert result["status"] == "COMPLETED"
            assert result["commands"][0]["stdout"] == "[REDACTED] Bearer [REDACTED]"
            assert (await execute_tests(session, settings, "other", repo, ["login"]))["status"] == "TEST_EXECUTION_UNAVAILABLE"
    asyncio.run(run())


def test_scoring_partial_skips_manual_and_excluded_paths():
    req = EvaluationRequest.model_validate(request(requirements=[requirement(method="SANDBOX_TEST", expected="login"), requirement(id="manual", method="MANUAL"), requirement(id="secret", expected=".env")]))
    repo = {"status": "INSPECTED", "commitSha": SHA, "paths": [], "limitations": []}
    tests = {"status": "COMPLETED", "suites": [{"id": "login", "cases": [{"status": "pass"}, {"status": "fail"}, {"status": "skip"}, {"status": "pass"}]}]}
    result = score_criteria(req.requirements, [], repo, tests)
    assert result["criteria"][0]["score"] == 5
    assert [c["status"] for c in result["criteria"]] == ["PARTIAL", "UNVERIFIED", "UNVERIFIED"]
    assert result["scoreOutOf10"] == 1.67


def test_unavailable_inspection_never_passes(api):
    async def broken_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(429))) as session:
            yield session
    app.dependency_overrides[client] = broken_client
    response = api.post("/v1/evaluations", headers=auth(), json=request())
    assert response.status_code == 200
    assert response.json()["scoring"]["scoreOutOf10"] is None
    assert response.json()["scoring"]["criteria"][0]["status"] == "BLOCKED"


def test_truncated_tree_does_not_prove_absence(api):
    async def truncated_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: github_response(r, truncated=True))) as session:
            yield session
    app.dependency_overrides[client] = truncated_client
    response = api.post("/v1/evaluations", headers=auth(), json=request(requirements=[requirement(expected="missing.ts")]))
    assert response.json()["scoring"]["criteria"][0]["status"] == "UNVERIFIED"
