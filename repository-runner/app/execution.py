import re
import hashlib
import os
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit
import docker
from app.config import Settings, SuiteDefinition
from app.bundles import digest as bundle_digest
from app.models import RunRequest


def validate_repository_url(value: str) -> str:
    parsed = urlsplit(value)
    parts = parsed.path.rstrip("/").split("/")[1:]
    if (parsed.scheme != "https" or parsed.netloc != "github.com" or parsed.query or parsed.fragment
            or len(parts) != 2 or any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", part) for part in parts)):
        raise ValueError("Only canonical GitHub HTTPS repository URLs are accepted")
    owner, repository = parts
    return f"https://github.com/{owner}/{repository.removesuffix('.git')}"


def suite_definitions(request: RunRequest, settings: Settings) -> list[tuple[str, SuiteDefinition]]:
    registry = settings.suites.get(request.projectId, {})
    result = []
    for suite_id in request.suites:
        definition = registry.get(suite_id)
        if not definition or request.suiteDigests[suite_id] != definition.digest:
            raise ValueError("Suite is not approved for this project")
        bundle = Path(definition.bundle).resolve()
        if not bundle.is_dir() or not (bundle / "run.sh").is_file():
            raise ValueError("Approved suite bundle is unavailable")
        if definition.prepare_dependencies and not (bundle / "prepare.sh").is_file():
            raise ValueError("Approved suite preparation script is unavailable")
        if bundle_digest(bundle) != definition.digest:
            raise ValueError("Approved suite bundle changed after registration")
        result.append((suite_id, definition))
    return result


def checkout_source(request: RunRequest, settings: Settings, directory: Path) -> Path:
    url = validate_repository_url(request.repositoryUrl)
    source = directory / "source"
    clone = ["git", "-c", "core.hooksPath=/dev/null", "clone", "--no-checkout", "--depth=1", url, str(source)]
    git_home = directory / "git-home"
    git_home.mkdir()
    environment = {
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "HOME": str(git_home),
        "PATH": __import__("os").environ.get("PATH", ""),
    }
    if settings.github_token:
        clone[1:1] = ["-c", f"http.extraheader=Authorization: Bearer {settings.github_token}"]
    subprocess.run(clone, check=True, timeout=45, capture_output=True, text=True, env=environment)
    subprocess.run(["git", "-C", str(source), "-c", "core.hooksPath=/dev/null", "fetch", "--depth=1", "origin", request.commitSha],
                   check=True, timeout=30, capture_output=True, text=True, env=environment)
    subprocess.run(["git", "-C", str(source), "-c", "core.hooksPath=/dev/null", "checkout", "--detach", request.commitSha],
                   check=True, timeout=20, capture_output=True, text=True, env=environment)
    found = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD^{tree}"], check=True, timeout=10,
                           capture_output=True, text=True, env=environment).stdout.strip()
    if found != request.treeSha:
        raise ValueError("Checked out source tree does not match the requested tree")
    return source


def clipped(value: str, limit=10000) -> str:
    return value[-limit:]


def prepare_dependencies(client, source: Path, definition: SuiteDefinition, request: RunRequest, directory: Path):
    dependencies = directory / "node_modules"
    directory.mkdir()
    dependencies.mkdir()
    os.chmod(dependencies, 0o777)
    preparation = client.containers.run(
        definition.image,
        command=["/bin/sh", "/bundle/prepare.sh"],
        detach=True,
        read_only=True,
        user="65532:65532",
        cap_drop=["ALL"],
        security_opt=["no-new-privileges:true"],
        pids_limit=256,
        nano_cpus=int(request.limits.cpuLimit * 1_000_000_000),
        mem_limit=f"{request.limits.memoryMb}m",
        volumes={str(source): {"bind": "/source", "mode": "ro"},
                 str(Path(definition.bundle).resolve()): {"bind": "/bundle", "mode": "ro"},
                 str(dependencies): {"bind": "/dependencies", "mode": "rw"}},
        tmpfs={"/tmp": f"rw,nosuid,nodev,mode=1777,size={request.limits.diskMb}m", "/work": "rw,nosuid,nodev,mode=1777,size=512m"},
    )
    try:
        outcome = preparation.wait(timeout=request.limits.timeoutSeconds)
        if int(outcome.get("StatusCode", 1)) != 0 or not (dependencies / "node_modules").is_dir():
            raise ValueError("Dependency preparation failed")
    finally:
        preparation.remove(force=True)
    return dependencies


def execute_suite(client, source: Path, suite_id: str, definition: SuiteDefinition, request: RunRequest, dependencies: Path | None):
    started = time.monotonic()
    result = client.containers.run(
        definition.image,
        command=["/bin/sh", "/bundle/run.sh"],
        detach=True,
        network_mode="none",
        read_only=True,
        user="65532:65532",
        cap_drop=["ALL"],
        security_opt=["no-new-privileges:true"],
        pids_limit=256,
        nano_cpus=int(request.limits.cpuLimit * 1_000_000_000),
        mem_limit=f"{request.limits.memoryMb}m",
        volumes={**{str(source): {"bind": "/source", "mode": "ro"},
                    str(Path(definition.bundle).resolve()): {"bind": "/bundle", "mode": "ro"}},
                 **({str(dependencies / "node_modules"): {"bind": "/source/node_modules", "mode": "ro"}} if dependencies else {})},
        tmpfs={"/tmp": f"rw,nosuid,nodev,mode=1777,size={request.limits.diskMb}m"},
        environment={"PROOFPAY_SOURCE": "/source", "PROOFPAY_SUITE_ID": suite_id},
    )
    try:
        result.wait(timeout=request.limits.timeoutSeconds)
        exit_code = int(result.attrs.get("State", {}).get("ExitCode", 1))
        output = clipped(result.logs(stdout=True, stderr=True).decode("utf-8", "replace"))
        status = "pass" if exit_code == 0 else "fail"
        return {"command": f"approved suite {suite_id}", "kind": definition.kind, "exitCode": exit_code,
                "durationMs": round((time.monotonic() - started) * 1000, 2), "stdout": output, "stderr": ""}, {"id": suite_id, "digest": definition.digest, "commandIndex": 0,
                "cases": [{"name": definition.case_name, "status": status}]}
    except Exception:
        result.kill()
        return {"command": f"approved suite {suite_id}", "kind": definition.kind, "exitCode": None,
                "durationMs": round((time.monotonic() - started) * 1000, 2), "stdout": "", "stderr": "Timed out or runner error."}, {"id": suite_id, "digest": definition.digest, "commandIndex": 0,
                "cases": [{"name": definition.case_name, "status": "fail"}]}
    finally:
        result.remove(force=True)


def run(request: RunRequest, settings: Settings):
    definitions = suite_definitions(request, settings)
    client = docker.from_env()
    with tempfile.TemporaryDirectory(prefix="proofpay-run-") as temporary:
        source = checkout_source(request, settings, Path(temporary))
        commands, suites = [], []
        for suite_id, definition in definitions:
            dependency_workspace = Path(temporary) / ("dependencies-" + hashlib.sha256(suite_id.encode()).hexdigest())
            dependencies = prepare_dependencies(client, source, definition, request, dependency_workspace) if definition.prepare_dependencies else None
            command, suite = execute_suite(client, source, suite_id, definition, request, dependencies)
            suite["commandIndex"] = len(commands)
            commands.append(command)
            suites.append(suite)
    return {"contractVersion": 2, "requestId": request.requestId, "projectId": request.projectId,
            "repositoryUrl": request.repositoryUrl, "commitSha": request.commitSha, "treeSha": request.treeSha,
            "status": "COMPLETED", "isolation": {"nonRoot": True, "network": "disabled", "productionSecrets": False,
            "privileged": False, "hostSocket": False, "sourceReadOnly": True, "cpuLimit": request.limits.cpuLimit,
            "memoryMb": request.limits.memoryMb, "timeoutSeconds": request.limits.timeoutSeconds, "diskMb": request.limits.diskMb},
            "commands": commands, "suites": suites}
