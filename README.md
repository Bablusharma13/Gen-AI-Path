# GenPath AI

**From Zero to Generative AI Engineer — Learn, Build, Deploy.**

GenPath AI is an interactive Generative AI learning platform: a structured curriculum with
prerequisites, visual labs that show how AI systems actually work, an AI mentor that knows your
progress, an organization knowledge base with cited answers, guided portfolio projects and a
career center — Hinglish-first, with English technical terms (English and Hindi selectable).

> Learn a concept → Visualize it → Experiment with it → Implement it → Evaluate it → Build a real
> project → Become job-ready.

## What's inside

| Area           | What you get                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curriculum     | 5 courses, 11 modules, 18 lessons (Python for AI → AI foundations → how LLMs work → RAG → agents), 18 quizzes, 18 Python exercises — all verified with real CPython |
| Labs           | Tokens & context, embeddings, attention, RAG pipeline, gradient descent — step-by-step, deterministic, honest about simplifications                                 |
| Practice       | Python runs in your browser (Pyodide in a Web Worker); never on the server                                                                                          |
| AI Mentor      | Streaming chat with your learning context, hints that don't leak solutions, concept cards; OpenAI-compatible (incl. Ollama), Anthropic or Gemini                    |
| Knowledge Base | Organizations upload txt/md/pdf/docx; answers come only from their documents, with citations checked in code and a "not found" path                                 |
| Projects       | 3 guided projects with milestones, rubrics and instructor review                                                                                                    |
| Career Center  | Readiness checklist from real progress + 25-question interview bank with model answers                                                                              |
| Admin          | Users and roles, AI usage and cost, project reviews, audit log, prompt catalogue                                                                                    |

## Quick start

Requirements: Node.js 22, pnpm 9, MongoDB 7+ (local or `docker compose up -d mongo`), Python 3
(only for `pnpm exercises:verify`).

```bash
pnpm install
cp .env.example .env     # set JWT_SECRET and JWT_REFRESH_SECRET (command inside the file)
pnpm seed                # load curriculum, quizzes, exercises, projects, interview questions
pnpm dev                 # API → http://localhost:4000 · Web → http://localhost:3000
```

Register at http://localhost:3000. To use the Knowledge Base and Admin pages, promote your account:

```bash
pnpm create-admin -- --email you@example.com
```

AI features need `AI_PROVIDER` (see `.env.example`; Ollama gives a free local model). With
`AI_PROVIDER=mock` every AI reply is a clearly labelled mock — useful for development, refused in
production. Without any provider, the mentor shows a setup guide and the knowledge base returns the
relevant passages instead of an answer.

Optional: `docker compose up -d redis` and `REDIS_URL=redis://127.0.0.1:6379` for shared rate
limits and durable background jobs (then run the worker: `pnpm dev:worker`).

## Repository

| Path               | What                                                                  |
| ------------------ | --------------------------------------------------------------------- |
| `apps/web`         | Next.js 16 frontend (App Router, React 19, Tailwind 4)                |
| `apps/api`         | Express 5 API + background worker                                     |
| `packages/shared`  | Zod schemas and API contracts shared by web and API                   |
| `packages/ai-core` | AI provider adapters, prompts, RAG utilities, lab simulations         |
| `content/`         | Versioned curriculum, project and interview-question YAML             |
| `docs/`            | Product, architecture, security, testing and deployment documentation |

## Scripts

| Command                 | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `pnpm dev`              | API + web in watch mode                                        |
| `pnpm check`            | typecheck → lint → test → build                                |
| `pnpm test`             | all test suites (API tests need MongoDB)                       |
| `pnpm content:validate` | validate all content and cross-references                      |
| `pnpm exercises:verify` | run every exercise and code example with real Python           |
| `pnpm seed`             | validate and load content (idempotent, never deletes progress) |
| `pnpm create-admin`     | create or promote a platform admin                             |

End-to-end tests run against a running stack — see [Testing](docs/TESTING.md).

## Status

See [Roadmap](docs/ROADMAP.md) for what is done and what could not be verified in the development
environment (live AI providers, Atlas Vector Search, S3, Redis/BullMQ locally, Docker image builds).

## Documentation

[Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Curriculum](docs/CURRICULUM.md) · [AI architecture](docs/AI_ARCHITECTURE.md) ·
[Interactive labs](docs/INTERACTIVE_LABS.md) · [Database](docs/DATABASE.md) ·
[Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md) ·
[Deployment](docs/DEPLOYMENT.md)
