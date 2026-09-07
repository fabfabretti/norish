# Caption-first testing — live ops tracking

Everything unusual we did to get the caption-first social import path working
against the deployed test stack, plus what to revert. NOT part of the feature
itself — this is an environment/diagnosis ledger.

## Status

- Feature code (caption fast-path) committed + pushed on `feature/social-caption-first`
  (`2a8fe270`).
- DeepSeek runtime repair IMPLEMENTED (this session), unit-tested 12/12, typecheck
  + lint + prettier clean. Not yet pushed → CI will build the image.
- Continuous failures were root-caused to DeepSeek compat-mode shape flakes; see
  Findings.

## 1. Deployed test image (needs revert after testing)

- `/home/fabs/server/containers/norish/docker-compose.yml` (on the server) now
  points `norish` at `image: ghcr.io/fabfabretti/norish:ci-test` (was
  `norishapp/norish:latest`). Direct edit of the base file — user rejected an
  override file.
- Revert to `norishapp/norish:latest` once real images flow again.
- Test image built only by GitHub Actions (`.github/workflows/docker-ci-image.yml`,
  GHCR-only, no Docker Hub secrets). NEVER build locally — machine OOMs.

## 2. Runtime DB hacks (server_config table, norish-db)

All values encrypted/split: `value` = masked display copy, `value_enc` =
AES-256-GCM ciphertext (HKDF from `MASTER_KEY` env in norish-app). Runtime reads
DB every call — no cache.

| key | change | revert by |
|-----|--------|-----------|
| `ai_config.model` | `deepseek-v4-flash` → `deepseek-chat` (both `value` + `value_enc`, version bumped to 4) | set back to a v4 model **if** the reasoner gets fixed; keep `deepseek-chat` for now |
| `prompts.recipeExtraction` | override = shipped default `recipe-extraction.txt` + appended "MEASUREMENT SYSTEMS ARE MANDATORY" (metric AND us, conversions) block | delete the `prompts` row to fall back to shipped default |

Warning: opening/saving Admin → AI settings will OVERWRITE `ai_config` and put
the model back to a v4 reasoner. The admin picker currently lists only
`deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp`; model is
`z.string().min(1)` so anything can be stored, but the picker can't select
`deepseek-chat`. (`packages/shared-server/src/ai/providers/listing.ts` — future
whitelist change.)

## 3. Findings

- `@ai-sdk/deepseek` sets `supportsStructuredOutputs = false` → every
  DeepSeek request runs in **compat mode**: JSON schema injected into the system
  message as text, never enforced by the API.
- `deepseek-v4-flash` (reasoner): consumes maxTokens on reasoning_tokens,
  emitted JSON truncated → `NoOutputGeneratedError` → "loading forever". This is
  why the model was switched to `deepseek-chat`.
- `deepseek-chat`: usually fine; on bigger captions flakes shape — arrays come
  back as objects (`{"0":.., "1":..}`), or nested under a wrapper key
  (`{"ingredients": [...]}`), or empty (`us: {}`). Same caption produced 3
  different malformed shapes across retries. The SDK zod parse rejects BEFORE
  app code sees the JSON.
- The runtime `jsonMode` fallback (`runtime.ts` ~291-319) excludes deepseek AND
  only fires on request-shape rejections, never on response-parse failures →
  no repair path exists for this flake.
- `deepseek-chat` verifiable on account; API accepts `thinking:{"type":"disabled"}`
  (real toggle) and `reasoning_effort:"none"` on the reasoners.

## 4. Test reels

- `https://www.instagram.com/reel/DZ-tbjTsDnZ/…` eggplant involtini — metric-only
  recipe; AI emitted name/12 metric ingredients/8 metric steps but no US arrays →
  `Recipe extraction failed - missing required fields` (validateExtractionOutput,
  extraction-normalizer.ts:62 hard-requires both metric AND us).
- `https://www.instagram.com/reel/C-rOJTNxqIa/…` cabbage water kimchi —
  attempts 1-2: object-shaped arrays → `response did not match schema: Type
  validation failed`; attempt 3: parsed, steps empty.
- Expected log signatures: `Trying recipe extraction from post caption first` →
  `Starting AI recipe extraction` → `AI request completed` … or `Recipe
  extraction failed …` → `Caption extraction did not yield a recipe, falling
  back to media` → (video parsing OFF) job fails `Video recipe parsing is not
  enabled` after BullMQ retries 3×~80s (= "loading forever" UX).

## 5. DeepSeek runtime repair — IMPLEMENTED (uncommitted until push)

What changed (all under `packages/shared-server/src/ai/runtime/`):

1. `providers.ts`: `deepseek` added to the plain-JSON-degrade set (was only
   generic-openai/lm-studio), so DeepSeek gets a second chance; new
   `PROVIDERS_WITH_SHAPE_REPAIR = {"deepseek"}` set.
2. `runtime.ts`:
   - `requestObject` now branches in plain-JSON mode for repair providers:
     drop the SDK's strict parse (`Output.object`), read the raw text,
     `JSON.parse`, then **`repairArrayShape`** before zod validation.
   - `repairArrayShape` fixes the observed DeepSeek flakes: numeric-key object
     → array (`{"0":..,"1":..}`), single wrapper key → spread inner array
     (`{"ingredients":[...]}`), empty object → `[]`; already-correct replies
     untouched; unknown keys dropped (schemas are strict).
   - `generateStructured` degrades to plain-JSON mode on schema-parse failures
     too, not just request-shape rejections (`NoObjectGeneratedError`).
   - generic-openai/lm-studio json_mode wire behavior is UNCHANGED (still
     `Output.object` + `response_format: json_object`) — existing #538 contract
     tests pass untouched.
3. Test: `__tests__/ai/runtime/structured-output.test.ts` gained 6 cases
   (deepseek eligibility + 5 repair-shape units, incl. the real nested
   `recipeIngredient` flake shape). 12/12 pass locally (vitest, no build).

Not fixed yet (deferred): the 3× BullMQ retry loop (make these non-retryable),
the admin model picker whitelist for `deepseek-chat`, stale
`packages/trpc/__tests__/recipes/import-video-gate.test.ts`, openapi 412 text.

## 6. Diagnostics (host, no builds)

`/tmp/opencode/`: `repro.py`, `repro.mjs` (reasoner truncation),
`matrix.mjs` (v4-flash/pro token budgets), `probe.mjs`/`probe2.mjs`/`probe3.mjs`
(deepseek-chat toy-schema probes), `setmodel.mjs`, `setprompt.mjs` (DB writes).

## 7. Operational commands

```bash
docker logs -f norish-app                          # see extraction verdicts
docker compose -f /home/fabs/server/containers/norish/docker-compose.yml pull
docker compose -f /home/fabs/server/containers/norish/docker-compose.yml up -d norish
```