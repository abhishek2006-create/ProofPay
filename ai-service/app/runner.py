"""Remote runner v2. The trusted control plane, never guest stdout, owns reports."""
import re
import secrets
from urllib.parse import urlsplit
from app.schemas.verification import RunnerReport
from app.transport import read_json


def unavailable(reason, status="TEST_EXECUTION_UNAVAILABLE"):
    return {"status": status, "reason": reason, "commands": [], "suites": []}


def validate_report(value, request, registry):
    report = RunnerReport.model_validate(value)
    for key in ("requestId", "projectId", "repositoryUrl", "commitSha", "treeSha"):
        if getattr(report, key) != request[key]:
            raise ValueError("Runner identity mismatch")
    if len({s.id for s in report.suites}) != len(report.suites):
        raise ValueError("Duplicate suites")
    if report.status != "COMPLETED":
        return unavailable("Isolated execution did not complete; no passing evidence is accepted.", report.status)
    if not report.commands or any(c.exitCode is None for c in report.commands):
        raise ValueError("Incomplete commands")
    for suite in report.suites:
        if suite.id not in request["suites"] or registry.get(suite.id) != suite.digest:
            raise ValueError("Suite is not an operator-approved test bundle")
        if suite.commandIndex >= len(report.commands):
            raise ValueError("Missing suite command")
        command = report.commands[suite.commandIndex]
        if command.kind != "test" or len({c.name for c in suite.cases}) != len(suite.cases):
            raise ValueError("Invalid suite cases")
        failed = any(c.status == "fail" for c in suite.cases)
        if (command.exitCode == 0 and failed) or (command.exitCode != 0 and not failed):
            raise ValueError("Exit code contradicts suite results")
    for i, command in enumerate(report.commands):
        if command.kind == "test" and not any(s.commandIndex == i for s in report.suites):
            raise ValueError("Unattributed test command")
    if not any(c.kind == "test" for c in report.commands):
        raise ValueError("No executed tests")
    return {"status": "COMPLETED", "reason": "Approved remote runner returned commit-bound, request-bound test evidence. Infrastructure isolation is an operator trust boundary.",
            "commands": [c.model_dump() for c in report.commands],
            "suites": [{"id": s.id, "cases": [c.model_dump() for c in s.cases]} for s in report.suites]}


async def execute_tests(client, settings, project_id, repository, suite_ids):
    if not suite_ids:
        return unavailable("No agreed runtime test suites were requested.")
    if repository["status"] != "INSPECTED" or not (settings.runner_approved and settings.runner_url and settings.runner_token):
        return unavailable("No approved remote runner or inspected repository is available. No submitted code ran on this host.")
    try:
        url = urlsplit(settings.runner_url)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("Runner requires an operator-configured HTTPS URL")
        registry = settings.suite_registry.get(project_id, {})
        if not isinstance(registry, dict) or any(not re.fullmatch(r"sha256:[a-f0-9]{64}", str(registry.get(s, ""))) for s in suite_ids):
            return unavailable("Every agreed suite must map to an operator-owned immutable test bundle for this project.")
        request = {"contractVersion": 2, "requestId": secrets.token_hex(32), "projectId": project_id,
                   "repositoryUrl": repository["repositoryUrl"], "commitSha": repository["commitSha"], "treeSha": repository["treeSha"],
                   "suites": sorted(set(suite_ids)), "suiteDigests": {s: registry[s] for s in sorted(set(suite_ids))},
                   "limits": {"network": "disabled", "timeoutSeconds": 90, "memoryMb": 2048, "cpuLimit": 2, "diskMb": 1024}}
        value = await read_json(client, "POST", settings.runner_url, timeout=100,
                                headers={"Authorization": f"Bearer {settings.runner_token}"}, json=request)
        report = validate_report(value, request, registry)
        for command in report["commands"]:
            for field in ("command", "stdout", "stderr"):
                text = command[field]
                for secret in (settings.runner_token, settings.service_token, settings.github_token):
                    if secret:
                        text = text.replace(secret, "[REDACTED]")
                command[field] = re.sub(r"Bearer\s+[\w.\-]+", "Bearer [REDACTED]", text)
        return report
    except Exception:
        # Remote failures are evidence of no trusted result, never a successful test.
        return unavailable("Runner unavailable, timed out, or returned invalid identity, isolation, or test evidence.", "SETUP_FAILED")
