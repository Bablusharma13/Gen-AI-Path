# GenPath AI — Testing Strategy

## 1. Commands

```bash
pnpm typecheck          # tsc --noEmit in every package
pnpm lint               # ESLint (flat config) across the monorepo, zero warnings
pnpm test               # Vitest in every package
pnpm build              # production builds (API bundle + Next.js)
pnpm content:validate   # curriculum, project and interview YAML against the content schemas
pnpm exercises:verify   # every exercise + code example run with real CPython (PYTHON=... to choose)
pnpm check              # typecheck, lint, test, build
pnpm --filter @genpath/web exec playwright test --workers=1   # E2E against a running stack
```

Current counts (all passing locally): shared 23, ai-core 68, web 20, API 128 (+1 BullMQ test that
runs only with Redis), E2E 3 specs. Exercises: 16, code examples: 14.

## 2. Test layers

| Layer                                                                                                              | Tooling                    | Location                      |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------- | ----------------------------- |
| Pure logic (schemas, roadmap, chunking, embeddings, lab simulations, citation validation, provider stream parsers) | Vitest                     | `packages/*/src/**/*.test.ts` |
| API integration (real Express app + real MongoDB, fake AI provider)                                                | Vitest + Supertest         | `apps/api/test/**/*.test.ts`  |
| Web units (API client, lab components logic)                                                                       | Vitest                     | `apps/web/src/**/*.test.ts`   |
| End-to-end (built app, real MongoDB, labelled mock AI, real Pyodide)                                               | Playwright + system Chrome | `apps/web/e2e`                |

## 3. Database in tests

API tests use a real MongoDB (`TEST_MONGODB_URI`, default `mongodb://127.0.0.1:27017`). Each test
file creates a uniquely named database `genpath_ai_test_<random>` and drops it afterwards, so tests
never touch development data and can run in parallel. CI starts `mongo:8` as a service container.

## 4. AI in tests

CI never calls live providers. Tests inject a deterministic fake provider (scripted outputs,
scripted failures: timeout, 429, invalid JSON). Provider adapters are tested against recorded wire
formats (SSE fixtures) with `fetch` stubbed.

There is no live-provider evaluation yet: nothing in the test suites proves answer quality from a
real model.

## 5. Redis / BullMQ

`apps/api/test/jobs-bullmq.test.ts` runs only when `TEST_REDIS_URL` is set (CI sets it); otherwise
Vitest reports it as **skipped**, not passed. The inline queue is exercised by every knowledge-base
test.

## 6. What the suites cover

Backend: registration/login/logout, refresh rotation + reuse detection, CSRF and origin checks,
RBAC (student blocked from admin), cross-user access prevention (progress, chats, notes),
cross-tenant retrieval prevention, NoSQL-injection payloads rejected, oversized bodies rejected,
course/lesson APIs, prerequisite handling, progress persistence, assessment scoring with hidden
answer keys, AI provider failures mapped to error states, quota enforcement, structured output
validation, RAG permission filtering, document deletion cleanup, upload validation.

Knowledge base: real PDF and DOCX extraction from generated files, upload validation (extension,
MIME, magic bytes, zip bomb), idempotent re-index, deletion everywhere, failed-document state,
cited answers with invalid citations removed, uncited answers withheld, NOT_FOUND, no model call
below the threshold, cross-tenant isolation (including forged document ids), admin-only visibility,
diagnostics access, behaviour without an AI provider.

Projects, career and admin: milestone XP awarded once, public-URL submissions, rubric-checked
self-assessment, reviewer permissions (no self-review, no emails exposed), readiness checklist from
real progress, private practice notes, admin access control, self-lockout prevention, suspension
revoking sessions, audit entries, AI usage reports, `.env.example` completeness.

Frontend: API client refresh/CSRF behaviour, lab logic, preference independence.

End-to-end: register → onboarding → roadmap → lesson → quiz → labs → Python practice in Pyodide;
mentor streaming with mock labels and history; projects → career → organization → upload → cited
answer → not-found → retrieval check → admin pages (account promoted with the real CLI). Every spec
fails on any page error or API response ≥ 400.

AI evaluation: explanation-language compliance heuristics, hint-first checks, schema validity,
citation validity, prompt-injection fixture (retrieved text instructing the model is treated as
data — verified at the prompt-assembly level).

## 7. Limits of what tests prove

Unit and integration tests show specified behaviour for the tested inputs. They do not prove the
absence of vulnerabilities, model quality, or performance under load. No performance target is
claimed without a representative measurement.
