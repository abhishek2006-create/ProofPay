"""Private FastAPI boundary. Start with: uvicorn app.main:app --host 127.0.0.1"""
import asyncio
import secrets
import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import Settings
from app.agents.github_agent import GitHubAgent
from app.agents.evaluation_agent import evaluate
from app.schemas.verification import EvaluationRequest, InspectRequest, ResolveRequest
from app.transport import ServiceError

app = FastAPI(title="ProofPay verification service", version="1.0.0", docs_url=None, redoc_url=None)
bearer = HTTPBearer(auto_error=False)
capacity = asyncio.Semaphore(4)


def settings():
    try:
        return Settings.from_env()
    except (ValueError, TypeError):
        raise HTTPException(503, "Service configuration is invalid")


def authenticated(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), config: Settings = Depends(settings)):
    if len(config.service_token) < 32:
        raise HTTPException(503, "Service authentication is not configured")
    if credentials is None or not secrets.compare_digest(credentials.credentials.encode(), config.service_token.encode()):
        raise HTTPException(401, "Invalid service credentials")
    return config


async def client():
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as session:
        yield session


class BodyLimit:
    def __init__(self, application):
        self.application = application

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.application(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > 256000:
                return await JSONResponse({"detail": "Request exceeds limit"}, status_code=413)(scope, receive, send)
            chunks.append(message)
            if not message.get("more_body", False):
                break
        async def replay():
            return chunks.pop(0) if chunks else await receive()
        await self.application(scope, replay, send)


app.add_middleware(BodyLimit)


@app.exception_handler(ServiceError)
async def service_error(request: Request, exc: ServiceError):
    return JSONResponse({"detail": exc.message}, status_code=exc.status)


@app.exception_handler(httpx.HTTPError)
async def remote_error(request: Request, exc: httpx.HTTPError):
    return JSONResponse({"detail": "Remote service unavailable"}, status_code=503)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "proofpay-verification", "contractVersion": 1}


@app.post("/v1/status")
async def status(config=Depends(authenticated)):
    return {
        "service": "proofpay-verification",
        "contractVersion": 1,
        "githubAuthenticated": bool(config.github_token),
        "runnerConfigured": bool(config.runner_approved and config.runner_url and config.runner_token),
        "trustedSuiteProjects": len(config.suite_registry),
    }


@app.post("/v1/repositories/resolve")
async def resolve(body: ResolveRequest, config=Depends(authenticated), session=Depends(client)):
    return await GitHubAgent(session, config).resolve(body.projectId, body.repositoryUrl, body.repositoryRef)


@app.post("/v1/repositories/inspect")
async def inspect(body: InspectRequest, config=Depends(authenticated), session=Depends(client)):
    return await GitHubAgent(session, config).inspect(body.projectId, body.submission)


@app.post("/v1/evaluations")
async def evaluation(body: EvaluationRequest, config=Depends(authenticated), session=Depends(client)):
    try:
        await asyncio.wait_for(capacity.acquire(), timeout=0.1)
    except TimeoutError:
        raise HTTPException(503, "Evaluation capacity reached; retry later")
    try:
        async with asyncio.timeout(145):
            return await evaluate(body, session, config)
    except TimeoutError:
        raise HTTPException(504, "Evaluation deadline exceeded; no result recorded")
    finally:
        capacity.release()
