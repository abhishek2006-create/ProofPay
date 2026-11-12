"""Inspect immutable GitHub objects as data. Never clone, import or execute them."""
import asyncio
import base64
import hashlib
import json
import re
from urllib.parse import quote, urlsplit
import httpx
from app.config import Settings
from app.schemas.verification import Submission
from app.transport import ServiceError, read_json

SHA = re.compile(r"^[a-f0-9]{40}$")


def parse_repository(value):
    u = urlsplit(value)
    parts = u.path.rstrip("/").split("/")[1:]
    if (u.scheme != "https" or u.netloc != "github.com" or u.query or u.fragment
            or len(parts) != 2 or any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", p) for p in parts)):
        raise ServiceError("Use https://github.com/owner/repository", 400)
    owner, repo = parts
    repo = repo.removesuffix(".git")
    if any(p in ("", ".", "..") for p in (owner, repo)):
        raise ServiceError("Invalid repository path", 400)
    return owner, repo, f"https://github.com/{owner}/{repo}"


def safe_path(path):
    return (isinstance(path, str) and 0 < len(path) <= 500
            and not path.startswith("/") and "\\" not in path and ".." not in path
            and not re.search(r"[\x00-\x1f\x7f]", path)
            and not re.search(r"\.(pem|key|p12|pfx)$", path, re.I)
            and not any(re.match(r"^(\.env(?:\.|$)|node_modules$|vendor$|\.git$|\.venv$|dist$|build$|coverage$|id_rsa|credentials(?:\.|$)|secrets?(?:\.|$))", p, re.I) for p in path.split("/")))


def empty_repository(submission):
    return {**submission.model_dump(), "status": "NOT_SUBMITTED", "paths": [], "files": [],
            "languages": [], "frameworks": [], "testFiles": [], "scripts": {},
            "limitations": ["Static code inspection does not prove runtime behavior."]}


class GitHubAgent:
    def __init__(self, client: httpx.AsyncClient, settings: Settings):
        self.client, self.settings = client, settings

    async def get(self, path):
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"}
        if self.settings.github_token:
            headers["Authorization"] = f"Bearer {self.settings.github_token}"
        return await read_json(self.client, "GET", "https://api.github.com" + path,
                               headers=headers, limit=6 * 1024 * 1024)

    async def authorize(self, project_id, url):
        owner, repo, canonical = parse_repository(url)
        metadata = await self.get(f"/repos/{owner}/{repo}")
        key = f"{owner}/{repo}".lower()
        if str(metadata.get("full_name", "")).lower() != key or type(metadata.get("private")) is not bool:
            raise ServiceError("Repository identity or visibility mismatch")
        allowed = self.settings.private_repos.get(project_id, [])
        if metadata["private"] and (not isinstance(allowed, list) or key not in [str(x).lower() for x in allowed]):
            raise ServiceError("Private repository is not authorized for this project", 403)
        return owner, repo, canonical

    async def resolve(self, project_id, url, ref):
        if not ref or len(ref) > 200 or re.search(r"[\x00-\x20?#\\]", ref) or ".." in ref:
            raise ServiceError("Invalid repository revision", 400)
        owner, repo, canonical = await self.authorize(project_id, url)
        commit = await self.get(f"/repos/{owner}/{repo}/commits/{quote(ref, safe='')}")
        sha, tree = commit.get("sha"), commit.get("commit", {}).get("tree", {}).get("sha")
        if not isinstance(sha, str) or not SHA.fullmatch(sha) or not isinstance(tree, str) or not SHA.fullmatch(tree):
            raise ServiceError("GitHub did not return an immutable commit/tree")
        return {"repositoryUrl": canonical, "repositoryRef": ref, "commitSha": sha, "treeSha": tree}

    async def inspect(self, project_id, submission: Submission):
        result = empty_repository(submission)
        if not submission.repositoryUrl:
            return result
        # Re-authorize private access and verify that the submitted tree belongs to the commit.
        pinned = await self.resolve(project_id, submission.repositoryUrl, submission.commitSha)
        if pinned["commitSha"] != submission.commitSha or pinned["treeSha"] != submission.treeSha:
            raise ServiceError("Pinned commit/tree mismatch", 409)
        owner, repo, canonical = parse_repository(pinned["repositoryUrl"])
        tree = await self.get(f"/repos/{owner}/{repo}/git/trees/{submission.treeSha}?recursive=1")
        if tree.get("sha") != submission.treeSha or not isinstance(tree.get("tree"), list):
            raise ServiceError("Invalid GitHub tree")
        entries = tree["tree"]
        for entry in entries:
            if (not isinstance(entry, dict) or not isinstance(entry.get("path"), str)
                    or entry.get("type") not in ("blob", "tree", "commit")
                    or not isinstance(entry.get("mode"), str)
                    or not isinstance(entry.get("sha"), str) or not SHA.fullmatch(entry["sha"])):
                raise ServiceError("Malformed repository tree entry")
        if len({entry["path"] for entry in entries}) != len(entries):
            raise ServiceError("Duplicate repository tree path")
        blobs = [x for x in entries if isinstance(x, dict) and x.get("type") == "blob"
                 and x.get("mode") in ("100644", "100755") and safe_path(x.get("path"))]
        paths = [x["path"] for x in blobs[:3000]]
        if len(set(paths)) != len(paths):
            raise ServiceError("Duplicate tree paths")
        selected = [x for x in blobs[:3000] if isinstance(x.get("size"), int) and 0 <= x["size"] <= 100000
                    and re.search(r"\.(py|tsx?|jsx?|json|md|toml|txt|go|rs|html|css|ya?ml)$", x["path"], re.I)]
        selected.sort(key=lambda x: (0 if re.search(r"(^|/)(package.json|pyproject.toml|requirements.*txt|README.*)$", x["path"], re.I) else 1, x["path"]))
        files = []
        for item in selected[:12]:
            sha = item.get("sha", "")
            if not isinstance(sha, str) or not SHA.fullmatch(sha):
                raise ServiceError("Invalid blob identity")
            blob = await self.get(f"/repos/{owner}/{repo}/git/blobs/{sha}")
            if blob.get("sha") != sha or blob.get("encoding") != "base64" or blob.get("size") != item["size"]:
                raise ServiceError("Invalid repository blob")
            try:
                data = base64.b64decode(re.sub(r"\s+", "", blob["content"]), validate=True)
                if len(data) != item["size"] or hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest() != sha:
                    raise ValueError("Blob integrity mismatch")
                text = data.decode("utf-8")
            except (ValueError, KeyError, TypeError) as exc:
                raise ServiceError("Invalid blob content") from exc
            if "\0" in text:
                continue
            files.append({"path": item["path"], "sha": sha, "text": text[:16000],
                          "reference": f"repo:{submission.commitSha}:{item['path']}"})
        frameworks, scripts = [], {}
        for f in files:
            if f["path"] == "package.json":
                try:
                    pkg = json.loads(f["text"])
                    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                    frameworks += [label for name, label in {"next": "Next.js", "react": "React", "vue": "Vue", "express": "Express"}.items() if name in deps]
                    scripts = {k: v for k, v in pkg.get("scripts", {}).items() if isinstance(v, str)}
                except (ValueError, AttributeError, TypeError):
                    result["limitations"].append("Invalid or truncated package.json; framework detection incomplete.")
            if re.search(r"(requirements.*txt|pyproject.toml)$", f["path"]):
                frameworks += [label for name, label in {"fastapi": "FastAPI", "django": "Django", "flask": "Flask"}.items() if name in f["text"].lower()]
        result.update(status="INSPECTED", repositoryUrl=canonical, paths=paths, files=files,
                      frameworks=sorted(set(frameworks)), scripts=scripts,
                      languages=sorted({label for p in paths for pattern, label in [(r"\.py$", "Python"), (r"\.tsx?$", "TypeScript"), (r"\.jsx?$", "JavaScript"), (r"\.go$", "Go"), (r"\.rs$", "Rust")] if re.search(pattern, p)}),
                      testFiles=[p for p in paths if re.search(r"(^|/)(tests?|__tests__)/|[._](test|spec)\.|(^|/)test_", p)])
        result["limitations"].append(f"Bounded inspection: {len(files)} text files read, at most 16000 characters each; {len(paths)} safe paths listed. Excluded files are not evidence of absence.")
        if tree.get("truncated") is not False or len(blobs) > 3000:
            result["limitations"].append("Repository tree is truncated or incomplete; missing paths cannot be treated as absent.")
        return result
