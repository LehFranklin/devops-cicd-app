# Self-Healing GitOps CI/CD Pipeline

A DevOps project that solves a real problem: most CI/CD pipelines deploy code and hope for the best. If a bad release ships, someone has to notice and manually roll it back — often too late. This project builds a pipeline that deploys automatically, watches real traffic during rollout, and **rolls itself back automatically** if something's wrong. No human in the loop.

## Architecture

```
Code push → GitHub Actions (test, build, push image to GHCR)
                    ↓
          Argo CD (GitOps sync, watches k8s/ manifests)
                    ↓
       Argo Rollouts (canary deployment: 20% → 50% → 100%)
                    ↓
   Prometheus (scrapes live error-rate metrics from canary pods)
                    ↓
   AnalysisTemplate (auto-aborts rollout if error rate > 10%)
                    ↓
          Grafana (dashboard: request rate, error rate, latency)
```

## Stack

- **App:** Node.js / Express, with `/health` and Prometheus `/metrics` endpoints
- **Containers:** Docker (multi-stage build, non-root user)
- **Cluster:** Kubernetes (local via `kind`)
- **CI:** GitHub Actions
- **Registry:** GitHub Container Registry (GHCR)
- **CD:** Argo CD (GitOps)
- **Progressive delivery:** Argo Rollouts (canary strategy)
- **Observability:** Prometheus + Grafana

## What it does

1. Every push to `main` triggers GitHub Actions: run tests, build a Docker image, push it to GHCR.
2. Argo CD detects the change in the `k8s/` manifests and syncs automatically — no manual `kubectl apply`.
3. Argo Rollouts deploys the new version as a **canary**: 20% of traffic first, then a live analysis phase, then 50%, then full promotion.
4. During the canary phase, an `AnalysisTemplate` queries Prometheus every 15 seconds for the **canary pod's specific error rate** (not the whole fleet — see below). If it exceeds 10% even once, the rollout **aborts automatically** and traffic reverts fully to the previous stable version.
5. Grafana visualizes request rate, error rate, and latency in real time.

## The bug I found (and the actual point of this project)

The first version of the error-rate query measured the error rate across **all** pods (stable + canary combined), not the canary specifically. With only 1 broken pod out of 4 total, its failures got diluted below the 10% threshold — so a genuinely broken deploy (80% failure rate) passed analysis and got promoted to production. Worse, the same flawed query then caused the system to **falsely reject a healthy rollback** in the other direction, because the majority of the fleet (the still-broken version) was skewing the average.

**Fix:** scoped the Prometheus query to only the canary pod(s), using Argo Rollouts' `podTemplateHashValue` mechanism to pass the canary's specific revision hash into the analysis, and a Prometheus relabeling rule to expose that hash as a queryable label. After the fix, redeploying the same broken version was caught and rolled back automatically within ~30 seconds — no human intervention.

This is a real lesson in canary analysis design: **the query has to isolate the thing you're actually testing**, or the safety net silently doesn't work.

## Local setup

```bash
# 1. Build and run the app
npm install && npm test
docker build -t devops-cicd-app:v1 .
docker run --rm -p 3000:3000 -e APP_VERSION=v1 devops-cicd-app:v1

# 2. Local Kubernetes cluster
kind create cluster --name devops-project
kind load docker-image devops-cicd-app:v1 --name devops-project

# 3. Install Argo CD, Argo Rollouts, and kube-prometheus-stack (see k8s/ for manifests)
kubectl apply -f k8s/

# 4. Watch a rollout live
kubectl argo rollouts get rollout devops-cicd-app --watch
```

## Repo structure

```
├── server.js                  # App: /health, /, /metrics
├── Dockerfile                 # Multi-stage, non-root build
├── test/                      # Unit tests
├── .github/workflows/ci.yml   # CI: test → build → push to GHCR
└── k8s/
    ├── rollout.yaml            # Argo Rollouts canary strategy
    ├── service.yaml
    ├── servicemonitor.yaml     # Prometheus scrape config + canary-hash relabeling
    ├── analysistemplate.yaml   # Automated rollback logic
    └── argocd-app.yaml         # Argo CD Application (GitOps entrypoint)
```
