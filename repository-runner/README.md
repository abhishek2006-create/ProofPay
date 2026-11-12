# ProofPay repository runner

Deploy this service on a machine separate from ProofPay. It accepts the Python verification service's contract-v2 jobs and creates one disposable Docker guest per approved suite. The guest has a read-only source checkout and test bundle, no network, non-root user, read-only root filesystem, dropped capabilities, no host socket, bounded temporary disk, CPU, memory, PID and wall-time limits.

## Deployment

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
export RUNNER_TOKEN="$(openssl rand -hex 32)"
export RUNNER_SUITE_REGISTRY_JSON='{}'
uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Run it behind HTTPS and private network access. The process needs access to the Docker daemon on the runner host to create guest containers. The guest containers do not receive that access. Run the service under a dedicated operating-system account on a host used only for runner jobs.

Build the service image on the runner host:

```sh
docker build -t proofpay-repository-runner:local .
```

The runner service itself needs `git` and Docker. Its `Dockerfile` includes `git`; a containerized deployment must expose the runner host's Docker API to this service. Host-native Uvicorn is the default deployment path in this repository.

Configure the Python verifier with the runner's HTTPS endpoint and same token:

```text
REPOSITORY_RUNNER_URL=https://runner.example/v2/run
REPOSITORY_RUNNER_TOKEN=<RUNNER_TOKEN>
RUNNER_SECURITY_APPROVED=true
RUNNER_TRUSTED_SUITES_JSON={"project-id":{"node-vitest":"sha256:<bundle digest>"}}
```

The runner registry has the matching suite definition. Every image uses an immutable Docker digest and every suite bundle has a SHA-256 digest.

```json
{
  "project-id": {
    "node-vitest": {
      "digest": "sha256:<64 lowercase hexadecimal characters>",
      "image": "node:24-bookworm-slim@sha256:<image digest>",
      "bundle": "/opt/proofpay-suites/node-vitest",
      "kind": "test",
      "caseName": "Approved Vitest suite",
      "prepareDependencies": true
    }
  }
}
```

`suites/node-vitest` is a sample bundle for Node projects that have `package-lock.json` and Vitest. Its preparation guest uses the package registry with `npm ci --ignore-scripts`, source mounted read-only and no credentials. It places dependencies in a temporary directory. The test guest has network disabled and mounts those dependencies at `/source/node_modules` read-only. Create a dedicated bundle and pinned image for each project framework and acceptance suite.

Calculate a bundle digest after reviewing the bundle:

```sh
python -m app.bundles suites/node-vitest
```

The configured digest is verified before every execution. Update it only after reviewing a changed bundle.

## Verification

```sh
.venv/bin/python -m pytest tests -q
```

The tests validate the authenticated contract input, canonical GitHub URLs, suite authorization and digest matching. This machine does not have Docker installed, so a real guest-container execution needs to run on the deployment host.
