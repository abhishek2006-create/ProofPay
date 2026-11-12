import asyncio
import os
import secrets
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import Settings
from app.execution import run
from app.models import RunRequest

app = FastAPI(title="ProofPay repository runner", docs_url=None, redoc_url=None)
bearer = HTTPBearer(auto_error=False)
capacity = asyncio.Semaphore(int(os.getenv("RUNNER_MAX_JOBS", "2")))


def settings():
    try:
        config = Settings.from_env()
    except ValueError as error:
        raise HTTPException(503, str(error))
    if len(config.token) < 32:
        raise HTTPException(503, "RUNNER_TOKEN must be at least 32 characters")
    if not 1 <= config.max_jobs <= 2:
        raise HTTPException(503, "RUNNER_MAX_JOBS must be between 1 and 2")
    return config


def authenticated(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), config: Settings = Depends(settings)):
    if credentials is None or not secrets.compare_digest(credentials.credentials, config.token):
        raise HTTPException(401, "Invalid runner credentials")
    return config


@app.get("/health")
async def health():
    return {"status": "ok", "service": "proofpay-repository-runner", "contractVersion": 2}


@app.get("/status")
async def status(config: Settings = Depends(authenticated)):
    return {"service": "proofpay-repository-runner", "contractVersion": 2,
            "configuredProjects": len(config.suites), "maxJobs": config.max_jobs}


@app.post("/v2/run")
async def execute(request: RunRequest, config: Settings = Depends(authenticated)):
    try:
        await asyncio.wait_for(capacity.acquire(), timeout=0.1)
    except TimeoutError:
        raise HTTPException(503, "Runner capacity reached")
    try:
        return await asyncio.to_thread(run, request, config)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception:
        return {"contractVersion": 2, "requestId": request.requestId, "projectId": request.projectId,
                "repositoryUrl": request.repositoryUrl, "commitSha": request.commitSha, "treeSha": request.treeSha,
                "status": "SETUP_FAILED", "isolation": {"nonRoot": True, "network": "disabled", "productionSecrets": False,
                "privileged": False, "hostSocket": False, "sourceReadOnly": True, "cpuLimit": request.limits.cpuLimit,
                "memoryMb": request.limits.memoryMb, "timeoutSeconds": request.limits.timeoutSeconds, "diskMb": request.limits.diskMb},
                "commands": [], "suites": []}
    finally:
        capacity.release()
