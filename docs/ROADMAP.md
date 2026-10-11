# GenPath AI — Roadmap and Phase Plan

Status legend: ✅ done and verified · 🟡 partially done (see notes) · ⬜ not started

"Verified" means covered by automated tests that pass locally (unit, API integration against a real
MongoDB, and Playwright end-to-end against the built app). Anything that could not be exercised in
the development environment is listed under **Not verified** for each phase.

> The original master prompt was truncated after the start of Phase 5. Phases 6+ below are derived
> from the prompt's sections 9–27 and the MVP acceptance criteria (§27).

## ✅ Phase 1 — Foundation

Monorepo, shared schemas, Express API skeleton (env validation, request IDs, structured logging,
centralized errors, health/readiness), MongoDB connection, Next.js app shell with design system,
Docker Compose for MongoDB + Redis, CI workflow, documentation.

## ✅ Phase 2 — Authentication and Personalization

Register/login/logout, refresh-token rotation with reuse detection, CSRF protection, password reset
and email verification (log transport in dev, SMTP in prod), RBAC, profile + independent
preferences, onboarding wizard, theme and language settings, roadmap generation (rule-based).

**Not verified:** SMTP delivery against a real mail server.

## ✅ Phase 3 — Curriculum Engine

Content schema + validator, idempotent seeder, courses/modules/lessons with prerequisites, lesson
renderer (localized, programming-language-aware code), progress tracking, notes/bookmarks,
assessment engine (MCQ + short answer, server scoring).

Seed curriculum: **4 courses, 9 modules, 16 lessons, 16 quizzes (56 questions), 16 Python
exercises**. Every exercise's reference solution passes and its starter code fails, and every code
example's printed output matches, when run with real CPython (`pnpm exercises:verify`).

## ✅ Phase 4 — Interactive Learning Labs

Step player, Tokens & Context, Embedding Similarity, Attention, RAG Pipeline and Gradient Descent
labs, in-browser Python runner (Pyodide in a Web Worker with timeouts). Every lab is embedded in at
least one lesson.

## ✅ Phase 5 — AI Mentor

Provider-agnostic LLM layer (OpenAI-compatible, Anthropic, Gemini, labelled mock), versioned prompt
registry, learner context builder, SSE streaming chat with saved sessions, explain/hint with
validated structured output, quotas and rate limits, usage + cost records, error states.

**Live check (2026-10-11):** the OpenAI-compatible path was run end to end against a local Ollama
model (`qwen2.5-coder:3b`): streamed mentor chat, JSON hints, JSON concept cards and cited
knowledge-base answers all worked. It exposed two issues that were fixed: the provider timeout cut
off long CPU-speed answers (now an idle timeout), and withheld knowledge answers returned no
passages. A 3B model's Hinglish and factual accuracy are weak — use a larger model for learners.

**Not verified:** Anthropic and Gemini against their live APIs (no keys; covered by recorded-response
tests).

## 🟡 Phase 6 — Knowledge Base and RAG

Done: organizations + memberships (tenant scope), org-admin document upload (txt/md/pdf/docx with
extension + MIME + magic-byte checks and a ZIP-bomb guard), local/S3 object storage adapter,
ingestion jobs (inline in development, BullMQ + worker process with Redis), heading-aware chunking,
embeddings, vector store adapters (MongoDB-local exact cosine, Atlas `$vectorSearch`), tenant- and
visibility-filtered hybrid retrieval, grounded answers with citations validated in code, a
not-found path that skips the model, retrieval diagnostics, versioned re-index and full deletion.

**Not verified:** Atlas Vector Search (no Atlas cluster), S3 storage (no bucket), the BullMQ path
(no Redis locally — its integration test runs in CI), semantic embedding providers (no API key; the
local lexical `local-hash` embeddings were used). The default threshold for semantic embeddings is
an uncalibrated starting point — see `docs/AI_ARCHITECTURE.md`.

## ✅ Phase 7 — Projects, Dashboard, Career, Admin

Three guided projects with milestones, self-assessed rubric checklists, submissions and instructor
review; dashboard; Career Center (readiness checklist computed from real progress + 25-question
interview bank with private practice notes); admin overview, users/roles/suspension, AI usage and
cost, project reviews, audit log and prompt catalogue.

## 🟡 Phase 8 — Hardening

Done: security tests (NoSQL operator injection, role escalation via profile updates, admin access
control, cross-tenant retrieval, document visibility, upload validation), production build,
Dockerfiles (API/worker and web standalone), CI with exercise verification and an end-to-end job,
documentation pass.

**Not verified:** Docker image builds (Docker was not running in the development environment; the
equivalent runtime layouts — pruned production API install and Next standalone server — were run
locally), the CI workflow itself (it has not run on GitHub yet), a full manual accessibility audit
with assistive technology.

## After the MVP

| Item                            | Notes                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side code runner         | Separate service, gVisor/Firecracker or equivalent, no network, non-root, read-only FS, cgroup limits. Required before any graded server-side execution. |
| Instructor authoring UI         | Draft → review → publish workflow on top of the content schema.                                                                                          |
| Cohorts / batches / assignments | Instructor-scoped learner progress with consent rules.                                                                                                   |
| Mock interviewer                | Rubric-based scoring with deterministic checks first; LLM grading only with calibration set.                                                             |
| Agent labs with real tool loops | Allow-listed tools, human approval UI, execution traces.                                                                                                 |
| Streaming knowledge answers     | The knowledge base answers in one response today; stream like the mentor once citation validation can run incrementally.                                 |
| Email invitations               | Organizations can only add people who already have an account.                                                                                           |
| OCR for scanned PDFs            | Scanned PDFs are rejected with a clear message today.                                                                                                    |
| More curriculum                 | Neural networks, LLM APIs, agents & tool calling, production GenAI, fine-tuning courses.                                                                 |
| LangGraph track                 | Framework implementation alongside the direct-SDK version.                                                                                               |
| Fine-tuning lab                 | Real LoRA run when GPU + licensed model available; simulated (labelled) otherwise.                                                                       |
| Billing                         | Real provider, signed + idempotent webhooks, server-side entitlements.                                                                                   |
| Live classroom / leaderboards   | Socket.IO, opt-in visibility.                                                                                                                            |
| Multimodal modules              | After verifying provider capabilities.                                                                                                                   |
