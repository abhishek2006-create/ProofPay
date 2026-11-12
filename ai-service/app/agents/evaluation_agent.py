"""Deterministic judgments; prose and file names never prove runtime behavior."""
import asyncio
import math
from datetime import datetime, timezone
import httpx
from app.agents.github_agent import GitHubAgent, empty_repository, safe_path
from app.runner import execute_tests
from app.transport import ServiceError


def score_criteria(requirements, checks, repository, tests):
    by_id = {c.requirementId: c for c in checks}
    criteria = []
    for r in requirements:
        check = by_id.get(r.id)
        status, score, evidence = "UNVERIFIED", None, []
        explanation = "No executed verification supports this criterion."
        test_result = "No runtime test supports this judgment."
        if r.method in ("TEXT_CONTAINS", "JSON_VALUE") and check:
            status = {"pass": "PASS", "fail": "FAIL"}.get(check.status, "UNVERIFIED")
            score = 10 if status == "PASS" else 0 if status == "FAIL" else None
            evidence, explanation = check.evidenceIds, check.explanation
        elif r.method == "MANUAL":
            evidence = check.evidenceIds if check else []
            explanation = "Human review is required; neither static code nor AI can approve this criterion."
        elif r.method == "REPO_FILE":
            if repository["status"] != "INSPECTED":
                status = "BLOCKED" if repository["status"] == "UNAVAILABLE" else "UNVERIFIED"
                explanation = "An accessible pinned repository is required."
            elif not safe_path(r.expected):
                explanation = "This path is excluded from safe inspection; absence is not proven."
            elif r.expected in repository["paths"]:
                status, score = "PASS", 10
                evidence = [f"repo:{repository['commitSha']}:{r.expected}"]
                explanation = "The agreed file exists in the pinned tree. This verifies file presence only."
            elif any("truncated" in x or "incomplete" in x for x in repository["limitations"]):
                explanation = "The bounded tree is incomplete; absence is not proven."
            else:
                status, score = "FAIL", 0
                explanation = "The agreed safe file path is absent from the complete pinned tree."
        elif r.method == "SANDBOX_TEST":
            suite = next((s for s in tests["suites"] if s["id"] == r.expected), None)
            if tests["status"] != "COMPLETED":
                status, explanation, test_result = "BLOCKED", tests["reason"], tests["status"]
            elif not suite or not suite["cases"]:
                explanation = "The agreed suite returned no executed cases."
            else:
                cases = suite["cases"]
                passed = sum(c["status"] == "pass" for c in cases)
                failed = sum(c["status"] == "fail" for c in cases)
                skipped = len(cases) - passed - failed
                score = math.floor(1000 * passed / len(cases) + 0.5) / 100 if passed + failed else None
                status = "UNVERIFIED" if score is None else "PASS" if passed == len(cases) else "FAIL" if passed == 0 and failed else "PARTIAL"
                evidence = [f"test:{repository['commitSha']}:{suite['id']}"]
                test_result = f"{passed} passed, {failed} failed, {skipped} skipped in agreed suite {suite['id']}."
                explanation = "Executed remote test evidence. " + test_result
        criteria.append({"criterionId": r.id, "description": r.description, "weight": r.weight,
                         "status": status, "score": score, "source": {"chunkId": r.sourceChunkId, "quote": r.sourceQuote,
                         "baseline": "Client-reviewed document citation and agreed specification" if r.sourceChunkId else "Client/freelancer agreed specification"},
                         "evidence": evidence, "testResult": test_result, "explanation": explanation,
                         "missingFunctionality": "The agreed check failed; inspect its evidence." if status == "FAIL" else None,
                         "recommendedImprovement": "Review the evidence scope and remaining human checks." if status == "PASS" else "Supply missing evidence, resolve blocked checks, or correct observed failures and submit a new version."})
    total = sum(c["weight"] for c in criteria)
    verified = [c for c in criteria if c["status"] in ("PASS", "PARTIAL", "FAIL") and c["score"] is not None]
    weight = sum(c["weight"] for c in verified)
    return {"criteria": criteria, "scoreOutOf10": math.floor(100 * sum(c["score"] * c["weight"] for c in verified) / total + 0.5) / 100 if verified else None,
            "verifiedWeightPercent": math.floor(10000 * weight / total + 0.5) / 100, "provisional": weight < total,
            "scorePolicy": "Deterministic agreed-weight lower bound. Unverified and blocked criteria earn no points; all-unverified reports have no score. Extracted optional criteria must be excluded by the client before agreement; the evaluator never changes agreed weights."}


async def evaluate(request, client, settings):
    try:
        async with asyncio.timeout(40):
            repository = await GitHubAgent(client, settings).inspect(request.projectId, request.submission)
    except ServiceError as exc:
        if exc.status in (400, 403, 409):
            raise
        repository = empty_repository(request.submission)
        repository.update(status="UNAVAILABLE", limitations=["Repository inspection unavailable; no inferred passing evidence."])
    except (httpx.HTTPError, TimeoutError, ValueError, TypeError, KeyError):
        repository = empty_repository(request.submission)
        repository.update(status="UNAVAILABLE", limitations=["Repository inspection failed or timed out; no inferred passing evidence."])
    tests = await execute_tests(client, settings, request.projectId, repository,
                                [r.expected for r in request.requirements if r.method == "SANDBOX_TEST"])
    scoring = score_criteria(request.requirements, request.checks, repository, tests)
    return {"schemaVersion": 1, "requestId": request.requestId, "projectId": request.projectId,
            "submissionId": request.submissionId, "specificationVersion": request.specificationVersion,
            "generatedAt": datetime.now(timezone.utc).isoformat(), "repository": repository,
            "tests": tests, "scoring": scoring,
            "limitations": ["Advisory only; client approval and payments remain separate.",
                            "No submitted repository is executed on the application or AI-service host.",
                            "Runtime results require an externally provisioned and audited runner.",
                            "The existing Next.js AI reviewer may explain evidence but cannot promote failed or unverified checks."]}
