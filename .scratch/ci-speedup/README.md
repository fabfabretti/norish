# CI Build Speedup

## Problem

RC release pipeline takes ~10-12 min: quality gates (~5-7 min) → Docker build (~3-5 min). The Docker build inside the container re-runs `pnpm run build` from scratch — the same build the quality gates just completed.

## Changes

### 1. Remove `--child-concurrency=1` from Dockerfile

**File:** `docker/Dockerfile`
**Est. savings:** ~30-60s on every Docker build (CI + local)

pnpm's default concurrency is unlimited. This flag was added during the RC v0.17.0 Dockerfile restructuring with no specific rationale — likely a conservative default during a large rewrite. The second `pnpm install` already uses `--ignore-scripts` (native modules were compiled in the `deps` stage), so concurrency is safe.

### 2. Skip E2E in quality gates for RC pushes

**Files:** `.github/workflows/_node-ci.yml`, `.github/workflows/rc-release-build.yml`
**Est. savings:** ~2-3 min per RC push

Adds a `skip-e2e` input (default `false`) to `_node-ci.yml`. When `true`, skips Playwright install, uv setup, parser runtime install, and the E2E suite. The RC release workflow passes `skip-e2e: true` because the Docker build test already exercises E2E against the built image.

PR quality gates (`pr-quality.yml`) and main release quality gates (`release-build.yml`) still run full E2E.

## Not done (and why)

- **Turbo remote cache:** `NODE_ENV` is in `globalPassThroughEnv` — quality gates build with `NODE_ENV=test`, Docker builds with `NODE_ENV=production`. Different cache keys, no reuse. Would require restructuring the pipeline to align envs.
- **Parallelizing quality + Docker:** Quality gates must pass before Docker publishes. Could restructure to run in parallel and gate publish on both, but that's a larger workflow refactor.

## Tracking

| Change | PR | Merged | Measured impact |
|--------|----|--------|-----------------|
| Remove child-concurrency=1 | — | — | — |
| Skip E2E for RC quality gates | — | — | — |
