# GenPath AI — Architecture

## 1. System overview

```
                        ┌──────────────────────────────────────────────┐
 Browser ──HTTPS──────▶ │ apps/web  (Next.js App Router, React, TS)    │
   │  Web Worker:       │  • UI, labs, lesson renderer                 │
   │  Pyodide sandbox   │  • /api/v1/* rewritten (same-origin proxy) ──┼──┐
   │  (student Python)  └──────────────────────────────────────────────┘  │
   │                                                                      ▼
   │                    ┌──────────────────────────────────────────────────────┐
   │                    │ apps/api  (Express 5, TS)  — HTTP process             │
   │                    │  modules: auth · profile · curriculum · assessments   │
   │                    │           labs · ai (mentor) · knowledge · projects    │
   │                    │           admin · health                              │
   │                    │  packages/ai-core: providers · prompts · chunking ·   │
   │                    │           embeddings · retrieval · citations · evals  │
   │                    └───────┬───────────────┬───────────────┬───────────────┘
   │                            │               │               │ enqueue
   │                            ▼               ▼               ▼
   │                      ┌──────────┐    ┌──────────┐    ┌──────────────────────┐
   │                      │ MongoDB  │    │  Redis   │◀──▶│ apps/api worker entry │
   │                      │ (data +  │    │ (rate    │    │ (BullMQ consumers:    │
   │                      │ vectors) │    │ limits,  │    │  ingestion, embedding)│
   │                      └──────────┘    │ queues)  │    └──────────────────────┘
   │                                      └──────────┘
   │                      Object storage adapter: local filesystem (dev) / S3-compatible (prod)
   │                      AI providers: OpenAI-compatible (OpenAI, Ollama, OpenRouter…), Anthropic, Gemini
```

## 2. Repository layout

```
apps/
  web/        Next.js frontend (student, admin UI, labs, mentor)
  api/        Express API + worker entrypoint (src/worker.ts) + seed/content tooling
packages/
  shared/     Zod schemas = single source of truth for API contracts, enums and content schema
  ai-core/    Provider adapters, prompt registry, chunking, local embeddings, retrieval math,
              citation validation, lab simulations shared by web and API
content/
  curriculum/ Versioned course + lesson YAML (validated by the shared content schema)
  projects/   Guided project templates (YAML)
docs/         Product, architecture, security, testing, deployment docs
scripts/      Developer utilities
.github/      CI workflow
```

### Deviations from the suggested structure (deliberate)

| Suggested                                       | Chosen                                                     | Reason                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared-types` + `packages/validation` | `packages/shared`                                          | Types are inferred from Zod schemas; splitting them would duplicate every contract.                                                                                            |
| `packages/ui`                                   | `apps/web/src/components/ui`                               | Only one UI consumer exists. Extract when a second app needs it.                                                                                                               |
| `packages/config`                               | root `tsconfig.base.json`, `eslint.config.mjs`             | One config consumer per tool; a package adds indirection without benefit.                                                                                                      |
| `services/workers`                              | `apps/api/src/worker.ts` (separate process, same codebase) | Workers need the same models and services as the API. Same image, different command.                                                                                           |
| `services/code-runner`                          | In-browser Pyodide sandbox (MVP)                           | Robust server-side isolation (gVisor/Firecracker, no network, cgroups) is not available in this environment. Rule 13: never run student code in the API. See `SECURITY.md §6`. |
| `services/ml-labs`                              | Post-MVP                                                   | Requires Python service + compute; labs are simulated and labelled until then.                                                                                                 |

## 3. Key architectural decisions

1. **Monorepo with pnpm workspaces, no build step for internal packages.** `@genpath/shared` and
   `@genpath/ai-core` export TypeScript source. Next.js transpiles them (`transpilePackages`), the
   API bundles them with tsup, Vitest and tsx read them directly.
2. **Same-origin API via Next.js rewrites.** The browser only talks to the web origin. `/api/v1/*`
   is proxied to the API. Cookies are first-party, HTTP-only and `SameSite=Lax`. CORS is still
   configured with an explicit allowlist for direct API access.
3. **REST under `/api/v1`, SSE for streaming.** Mentor streaming uses `text/event-stream` over a
   POST request (fetch + ReadableStream). Socket.IO is not introduced until a genuine real-time
   feature (live classroom, collaborative lab) exists.
4. **Zod at every boundary.** Env vars, request bodies, query strings, content files, AI structured
   outputs and lab visualization events are validated with schemas from `@genpath/shared`.
5. **Ownership enforced in services, not just routes.** Every repository/service function that reads
   user data takes the authenticated principal and scopes the query (`userId`, tenant filter).
6. **Graceful degradation.** Redis, AI providers, embeddings providers and object storage are
   optional in development. Each has an explicit fallback that is _labelled_:
   - No Redis → in-memory rate limits and an in-process job runner (single-instance only).
   - No AI provider → mentor shows a configuration guide; `mock` provider is available only outside
     production and every mock response is tagged as mock in the UI.
   - No embedding provider → `local-hash` embeddings (deterministic feature hashing, lexical not
     semantic), clearly labelled in lab UI and retrieval diagnostics.
7. **Content as code.** Curriculum lives in versioned YAML, validated in CI, seeded idempotently
   into MongoDB by stable IDs. Lessons are never hard-coded in React components.
8. **Deterministic visualizations.** Labs compute a validated list of steps from a fixture + config.
   The renderer owns rendering; AI may propose explanations, never markup or code to execute.

## 4. Request lifecycle (API)

```
request → requestId → pino-http logger → helmet → CORS → body limits → cookie parser
        → origin + CSRF check (unsafe methods) → rate limiter → route
        → authenticate (access JWT cookie → session + user lookup) → authorize (role/ownership)
        → validate (Zod) → controller → service (scoped queries) → response envelope
        → centralized error handler (AppError → JSON error with requestId; no stack in production)
```

Response envelope:

```json
{ "data": { } }
{ "data": [ ], "page": { "limit": 20, "nextCursor": "..." } }
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ ], "requestId": "…" } }
```

## 5. Module map (API)

| Module      | Responsibility                                                                      | Collections                                                     |
| ----------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| health      | liveness/readiness, dependency checks                                               | —                                                               |
| auth        | register, login, logout, refresh rotation, verify email, password reset             | users, sessions, authTokens                                     |
| profile     | profile, preferences, onboarding                                                    | profiles                                                        |
| roadmap     | rule-based learning path, known/pinned courses                                      | roadmaps                                                        |
| curriculum  | courses, lessons, progress, notes, bookmarks, search                                | courses, lessons, lessonProgress, enrollments                   |
| assessments | quizzes, attempts, server-side scoring                                              | assessments, assessmentAttempts                                 |
| exercises   | exercise catalogue, attempt records, gated solutions                                | exercises, exerciseAttempts                                     |
| progress    | dashboard summary, weak topics                                                      | (reads progress collections)                                    |
| learning    | events, streaks, XP                                                                 | learningEvents                                                  |
| ai          | mentor chat (SSE), explain, hint, lab embeddings, quotas, usage                     | chatSessions, chatMessages, aiInteractions                      |
| knowledge   | organizations, members, uploads, extraction, ingestion, retrieval, grounded answers | organizations, memberships, knowledgeDocuments, knowledgeChunks |
| projects    | guided projects, milestones, submissions, reviews                                   | projects, projectProgress, projectSubmissions                   |
| career      | readiness checklist, interview question bank, practice notes                        | interviewQuestions, interviewPractice                           |
| admin       | overview, users/roles/suspension, AI usage and cost, audit log, prompt catalogue    | (reads); auditLogs                                              |
| audit       | append-only security log                                                            | auditLogs                                                       |

## 6. Frontend structure

```
apps/web/src/
  app/                 routes (App Router): marketing, auth pages, (app)/dashboard, path, courses,
                       labs, practice, mentor, knowledge, projects, assessments, career, settings,
                       admin, status
  components/ui/       accessible primitives (button, card, dialog, tabs, inputs, badge, feedback)
  components/viz/      charts (palette validated for contrast, table view for every chart)
  features/labs/       lab UIs (pure logic in @genpath/ai-core)
  features/practice/   Pyodide runner hook
  lib/                 typed API client (CSRF + refresh), TanStack Query hooks per feature
apps/web/public/workers/pyodide-worker.js   Python sandbox (Web Worker)
```

Data fetching uses TanStack Query against the typed API client. `proxy.ts` (Next 16 replacement
for middleware) only performs a UX redirect for signed-out users; it is **not** a security boundary —
the API authorizes every request. Role-dependent UI (e.g. Admin tabs) is a convenience; every
endpoint enforces its own permission.

## 7. Background processing

`JobQueue` interface (`apps/api/src/lib/jobs.ts`) with two implementations:

- `BullJobQueue` (when `REDIS_URL` is set): enqueues `ingest` jobs on the `knowledge-ingest` queue
  with a job id of `<documentId>-v<indexVersion>`, so enqueueing the same version twice is a no-op.
  One attempt per job (a failed document shows its error and can be re-indexed from the UI).
  Consumed by `apps/api/src/worker.ts` (concurrency 2, graceful shutdown). **Not verified locally**
  (no Redis); an integration test runs in CI.
- `InlineJobQueue` (no Redis, development only): runs jobs one at a time in the API process after
  the response. Not durable; production refuses to start without Redis.

The ingestion handler is idempotent per `(documentId, indexVersion)`: it writes that version's
chunks inactive, commits only if the document still has that version, activates them and deletes
every other version. Superseded or deleted jobs discard their output.

## 8. Configuration

All configuration comes from environment variables validated at startup (`apps/api/src/config/env.ts`).
Missing or invalid variables stop the process with a readable list of problems. See `.env.example`
and `DEPLOYMENT.md`.

## 9. Version decisions (October 2026)

| Dependency   | Version | Notes                                                                                              |
| ------------ | ------- | -------------------------------------------------------------------------------------------------- |
| Node.js      | 22 LTS  | `engines` enforced                                                                                 |
| pnpm         | 9.15    | workspaces                                                                                         |
| TypeScript   | 5.9.3   | TS 7 (native) not yet supported by typescript-eslint (`<6.1.0`); 5.9 has the broadest tool support |
| Next.js      | 16.3.x  | 16.4.0 was 3 days old at scaffold time; patch line chosen for stability                            |
| React        | 19.2.x  |                                                                                                    |
| Tailwind CSS | 4.x     | CSS-first config                                                                                   |
| Express      | 5.2.x   | native async error propagation                                                                     |
| Mongoose     | 9.x     | MongoDB driver 7                                                                                   |
| Zod          | 4.x     |                                                                                                    |
| BullMQ       | 5.x     | v6 introduced pluggable backends; 5.x is the mature API (connections passed as ioredis instances)  |
| ioredis      | 5.x     | matches BullMQ 5                                                                                   |
| Vitest       | 4.1.x   | v5 was one month old                                                                               |
| ESLint       | 9.39.x  | flat config; eslint-config-next plugins track ESLint 9 most reliably                               |
