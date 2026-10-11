# GenPath AI — Local Setup and Deployment

## 1. Prerequisites

| Tool    | Version                                                |
| ------- | ------------------------------------------------------ |
| Node.js | 22 LTS                                                 |
| pnpm    | 9.x (`corepack enable` or `npm i -g pnpm@9`)           |
| MongoDB | 7+ (local install **or** `docker compose up -d mongo`) |
| Redis   | optional in development (`docker compose up -d redis`) |

## 2. Local development

```bash
pnpm install
cp .env.example .env            # then fill in JWT_SECRET and JWT_REFRESH_SECRET (see below)
docker compose up -d mongo redis   # or use your local MongoDB and skip Redis
pnpm seed                       # validate + load curriculum, assessments, projects
pnpm create-admin -- --email you@example.com --name "Your Name"   # prompts for a password
pnpm dev                        # API on :4000, web on :3000
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Open http://localhost:3000.

### Low-cost development mode

| Missing service                  | Behaviour                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis                            | In-memory rate limits; in-process job runner (single instance, not durable). Logged at startup.                                            |
| AI provider (`AI_PROVIDER=none`) | Mentor shows a configuration guide; everything else works.                                                                                 |
| `AI_PROVIDER=mock`               | Deterministic mock responses, tagged **Mock AI** in the UI. Refused in production.                                                         |
| Free local model                 | Install Ollama, `ollama pull llama3.2`, set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL=http://localhost:11434/v1`, `AI_MODEL=llama3.2`. |
| Embedding provider               | `AI_EMBEDDING_PROVIDER=local-hash` (lexical, labelled).                                                                                    |
| Object storage                   | `OBJECT_STORAGE_DRIVER=local` writes to `.data/uploads`.                                                                                   |
| SMTP                             | `MAIL_TRANSPORT=log` writes verification/reset links to the API log (development only).                                                    |

## 3. Services in production

| Component      | Command                                                                | Notes                                                                         |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web            | `pnpm --filter @genpath/web build && pnpm --filter @genpath/web start` | Set `API_URL` to the internal API address used by rewrites.                   |
| API            | `pnpm --filter @genpath/api build && node apps/api/dist/index.js`      | Stateless; scale horizontally once Redis is configured.                       |
| Worker         | `node apps/api/dist/worker.js`                                         | Required when `REDIS_URL` is set: consumes knowledge-base ingestion jobs.     |
| MongoDB        | Atlas or self-managed replica set                                      | Backups + point-in-time restore recommended.                                  |
| Redis          | Managed Redis                                                          | Required in production (rate limits shared across instances, durable queues). |
| Object storage | S3-compatible bucket                                                   | Private bucket; the API streams files, no public URLs.                        |
| Vector search  | `mongodb-local` (small corpora) or Atlas Vector Search                 | Index definition in `docs/AI_ARCHITECTURE.md` §7.                             |

Production startup refuses: `AI_PROVIDER=mock`, missing Redis, `MAIL_TRANSPORT=log`, weak secrets,
`COOKIE_SECURE=false`.

## 4. Docker

| File                  | Image                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/Dockerfile` | API (`node dist/index.js`) and worker (`node dist/worker.js`): bundled API + pruned production deps (`pnpm deploy --prod`), curriculum content, non-root user, health check. |
| `apps/web/Dockerfile` | Next.js standalone server (`NEXT_OUTPUT=standalone`), non-root. `API_URL` is a **build argument** because the `/api/v1` rewrite is fixed at build time.                      |

`docker-compose.yml` provides MongoDB and Redis for development, and an `app` profile that builds
and runs web, API and worker:

```bash
docker compose up -d mongo redis           # databases only
docker compose --profile app up --build    # full stack (needs a filled-in .env)
docker compose exec api node dist/scripts/seed.js
```

**Verification status:** the images have not been built in the development environment (Docker
was not running). The same runtime layouts were exercised directly: the pruned production API
install started and reported ready, and the standalone web server served pages, static assets, the
Pyodide worker and the API rewrite. Build the images once in your environment before relying on
them.

## 5. Health checks

- `GET /api/v1/health/live` — process is up (no dependencies).
- `GET /api/v1/health/ready` — MongoDB ping, Redis ping (if configured), queue mode, AI provider
  configuration state (configured / not configured — never secrets). Returns 503 when a required
  dependency is down.

## 6. CI

`.github/workflows/ci.yml`:

- **check** — install → content validation → exercises and code examples run with real Python →
  typecheck → lint → format check → tests (MongoDB and Redis service containers, so the BullMQ test
  runs) → build → dependency audit (report only).
- **e2e** — build → seed → start API (with the labelled mock AI) and web → Playwright with the
  runner's Chrome. Logs and traces are uploaded on failure.

The workflow has not yet run on GitHub; expect to adjust it on the first run.

## 7. Rollback

Deploy immutable images tagged by commit SHA; roll back by redeploying the previous tag. Content
changes are versioned in Git and re-seeded idempotently. Seeding never deletes learner progress.

## 8. Troubleshooting

| Symptom                                          | Fix                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment configuration` at API start | Read the listed variables; compare with `.env.example`.                                                                   |
| `MongoServerSelectionError`                      | MongoDB not running / wrong `MONGODB_URI`.                                                                                |
| Login works but every request is 401             | Cookies blocked: use `http://localhost:3000` (not 127.0.0.1 mixed with localhost) and keep `COOKIE_SECURE=false` locally. |
| 403 `CSRF_FAILED`                                | Request missing `X-CSRF-Token` header or from a non-allowed origin.                                                       |
| Mentor says "AI is not configured"               | Set `AI_PROVIDER` + key/model, restart the API.                                                                           |
| Python exercises never load                      | The browser must reach the Pyodide CDN (`cdn.jsdelivr.net`).                                                              |
| Uploaded document stays "Queued"                 | With `REDIS_URL` set, start the worker (`node apps/api/dist/worker.js`). Without Redis, jobs run inside the API.          |
| Document "Failed: No text found in this PDF"     | Scanned (image-only) PDFs need OCR, which is not supported; upload a text PDF, DOCX or Markdown instead.                  |
| Knowledge answers always "not found"             | Check scores in Knowledge Base → Retrieval check and tune `KB_MIN_SCORE`; re-index after changing the embedding model.    |
| Can't create an organization                     | Requires a platform role of instructor, org admin or platform admin (`pnpm create-admin` or Admin → Users).               |
