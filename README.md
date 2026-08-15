# devops-cicd-app

Sample app for the "Self-Healing GitOps CI/CD Pipeline" project.

## Endpoints
- `GET /health` — liveness/readiness probe, returns `{ status: "ok", version }`
- `GET /` — main route; errors at a configurable rate via `FAIL_RATE` env var
  (used later to simulate a bad deploy and prove automated rollback works)
- `GET /metrics` — Prometheus scrape endpoint

## Run locally (no Docker)
```bash
npm install
npm test        # run unit tests
npm start        # start the server on :3000
curl localhost:3000/health
```

## Run in Docker
```bash
docker build -t devops-cicd-app:v1 .
docker run --rm -p 3000:3000 -e APP_VERSION=v1 devops-cicd-app:v1

# in another terminal
curl localhost:3000/health
curl localhost:3000/
curl localhost:3000/metrics
```

## Simulate a bad deploy (for later rollback testing)
```bash
docker run --rm -p 3000:3000 -e APP_VERSION=v2-broken -e FAIL_RATE=0.8 devops-cicd-app:v1
curl localhost:3000/    # ~80% of requests will return 500
```
