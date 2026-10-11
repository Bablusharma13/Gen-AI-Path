# GenPath AI — Security Design

This document describes the security boundaries that are implemented and the residual risks that
remain. Passing tests do not prove a boundary is safe; they prove the specified behaviour for the
tested cases.

## 1. Trust boundaries

| Boundary                  | Trusted side                 | Untrusted side                                               |
| ------------------------- | ---------------------------- | ------------------------------------------------------------ |
| Browser ↔ API             | API                          | Everything from the browser: bodies, query, headers, cookies |
| API ↔ AI provider         | API                          | Model output (text, JSON, tool calls)                        |
| API ↔ knowledge documents | API                          | Document text, metadata, retrieved chunks                    |
| API ↔ content files       | Repository (reviewed in PRs) | — (validated anyway)                                         |
| Browser ↔ student code    | Main page                    | Code running in the Pyodide Web Worker                       |

## 2. Authentication

- **Passwords:** Argon2id (`@node-rs/argon2`, memory 19 MiB, t=2, p=1 — OWASP baseline). Length
  10–128. Hashes are never returned by any endpoint (`select: false` + DTO mapping).
- **Access token:** JWT (HS256, `JWT_SECRET` ≥ 32 chars), 15-minute lifetime, claims `sub`, `sid`.
  Delivered as HTTP-only cookie `gp_at`. Every request re-checks the session and user status in the
  database, so logout, suspension and role changes take effect immediately.
- **Refresh token:** 256-bit random opaque value in HTTP-only cookie `gp_rt` scoped to
  `/api/v1/auth`. Stored only as `HMAC-SHA256(JWT_REFRESH_SECRET, token)`. Rotated on every refresh.
  Presenting an already-rotated token is treated as theft: the whole session is revoked.
- **Cookies:** `HttpOnly`, `SameSite=Lax`, `Secure` in production (or when `COOKIE_SECURE=true`).
- **Email verification / password reset:** single-use, hashed tokens with 24 h / 30 min expiry
  (TTL-indexed). Reset revokes all sessions. Forgot-password responses are identical whether the
  account exists or not.
- **Throttling:** login and forgot-password are rate-limited per IP and per email.

## 3. CSRF

Unsafe methods (`POST/PUT/PATCH/DELETE`) require:

1. An `Origin` (or `Referer`) header matching `WEB_URL`/`CORS_ORIGINS` when present, and
2. A double-submit token: header `X-CSRF-Token` equal to the non-HTTP-only `gp_csrf` cookie.

Combined with `SameSite=Lax` this blocks cross-site form posts and cross-origin fetches.

## 4. Authorization

- Roles: `student`, `instructor`, `org_admin`, `platform_admin` (platform-level), plus
  organization membership roles (`member`, `instructor`, `admin`).
- `requireAuth` → `requireRole(...)` for route-level checks, **plus** ownership/tenant scoping
  inside services (every query includes `userId` or a tenant filter derived from the principal).
- Learners can never edit system prompts, curriculum, or other users' data. Role fields sent to
  profile endpoints are stripped by validation (tested).
- Platform admin (`/api/v1/admin/*`): every route requires `platform_admin`. Admins cannot change
  their own role or status; suspension revokes all of the target's sessions; role changes apply on
  the next request because sessions and users are re-checked on every request.
- Project reviews: `instructor` or `platform_admin`; a reviewer can never review their own
  submission. Reviewers see learner names only, never emails.
- Organizations (knowledge base): non-members get **404** for every organization route (ids cannot be
  probed); members can ask and list member-visible documents; only organization admins upload,
  re-index, change visibility, delete, manage members and use retrieval diagnostics. Organizations
  always keep at least one admin. Creating an organization needs a platform role of `instructor`,
  `org_admin` or `platform_admin`.
- Admin and organization mutations write `auditLogs` entries (actor, action, target, small
  metadata, request ID, keyed IP hash).

## 5. Input handling

- Zod validation on every body/query/params; unknown keys stripped; strings length-limited.
- NoSQL injection: Zod forces primitive types on every input; a middleware rejects body and query
  keys that start with `$`, contain `.`, or are `__proto__`/`constructor`; and Express 5's simple
  query parser never builds nested objects, so `?role[$in]=…` arrives as an ignored literal key.
  Search text is regex-escaped before use. (Mongoose `sanitizeFilter` is not enabled globally because
  the services build their own `$in`/`$ne` filters.) Tests cover body operators, bracketed query
  keys and regex metacharacters.
- Body size limit 1 MB JSON. Knowledge-base uploads: org admins only, membership checked **before**
  the body is read, one file per request, `UPLOAD_MAX_BYTES` (default 10 MB), 30 uploads/hour per
  user. The type must agree three ways — extension, declared MIME type and magic bytes (`%PDF-`,
  ZIP header; text must be valid UTF-8 without NUL bytes). A `.docx` ZIP directory is inspected
  before decompression and rejected above 60 MB uncompressed or 2,000 entries (zip-bomb guard), and
  must contain `word/document.xml`. Extracted text is capped at 1,000,000 characters and 3,000
  chunks per document.
- Storage keys are generated by the server (`orgs/<orgId>/<docId>/original.<ext>`); the local
  driver refuses keys that are not `[a-z0-9/_.-]` or that resolve outside its root. Uploaded file
  names are only displayed (directories and control characters stripped).
- XSS: React escapes by default; Markdown is rendered **without raw HTML**; no
  `dangerouslySetInnerHTML` with untrusted content; strict security headers.
- Helmet on the API, CSP + security headers on the web app.

## 6. Code execution

- Student Python runs **only in the learner's browser**, inside a dedicated Web Worker running
  Pyodide (CPython compiled to WebAssembly). The worker has no DOM access, is terminated on timeout
  (8 s per run, hard kill via `worker.terminate()`), and output is capped at 20,000 characters.
- The server never executes student code. Exercise results reported from the browser are recorded
  as `client-verified` and are **not** used for formal grading.
- Residual risk: code in the worker can make network requests the browser permits (the CSP
  `connect-src` limits destinations to self and the Pyodide CDN). It runs with the learner's own
  privileges in their own browser — equivalent to them opening devtools.
- Before any server-side grading: a separate `code-runner` service with gVisor/Firecracker,
  network disabled, non-root, read-only rootfs, cgroup CPU/memory/pids limits, wall-clock kill,
  output caps, no secrets mounted. Not built yet (see `ROADMAP.md`).

## 7. AI-specific controls

- System prompts are code-reviewed, versioned, and never editable by learners.
- Retrieved passages and user-supplied text are wrapped in delimited, labelled blocks
  (`<source id="n" title="…">`, `<question>`, `<learner_context>`, `<current_lesson>`) and the
  system prompt instructs the model to treat them as data. Closing tags inside the content are
  escaped so a document cannot end its own block (tested).
- Retrieval is filtered **inside the query** by organization, active index version, embedding
  model, document visibility and any requested document subset — before ranking, never afterwards
  in the prompt. A forged `documentIds` filter naming another tenant's document returns nothing
  (tested). Admin-only documents are invisible to members in listings, retrieval and answers
  (tested).
- When nothing passes the relevance threshold the model is not called at all.
- Structured outputs are validated with Zod; invalid output is retried once, then surfaced as an
  error (never partially trusted).
- Citations are validated in code: a citation must reference a passage that was actually given to
  the model; unknown citations are removed and reported, and an answer with no valid citation is
  withheld instead of shown.
- Model output is rendered as Markdown text only (no HTML, no script execution).
- Quotas: per-user daily request limits, max input characters, max output tokens, request timeouts.
- Logs record metadata (model, tokens, latency, status) — not full prompts or document contents.
- No tools are exposed to models: no shell, filesystem, database or network access. (Agent labs
  with tool calling are future work and will require an allow-list, per-tool permissions and human
  approval for consequential actions.)

## 8. Secrets

- Only `.env.example` is committed. Startup validation refuses weak/missing secrets in production.
- Secrets never reach the frontend bundle (no `NEXT_PUBLIC_` secrets; AI keys are server-only).
- Pino redacts authorization, cookie, CSRF and set-cookie headers and password/token fields.
- `.env.example` ships no secrets (a test checks this and that every variable the API reads is
  documented).

## 9. Privacy

- Learners can view personalization settings, disable mentor personalization, and delete chat
  history. Interview practice notes are private to the learner.
- Knowledge-base logs record ids, counts and scores, never document text or questions.
- Progress and assessment details are private by default; nothing is public without opt-in.
- Data retention: auth tokens expire via TTL; learning events kept 365 days; AI interaction records
  keep metadata only.

## 10. Known residual risks / not yet implemented

- No WAF or bot protection; rate limits are per-instance without Redis.
- Atlas Vector Search and S3 storage adapters are implemented against the documented APIs but not
  verified against a live cluster or bucket in this environment.
- PDF parsing (pdf.js via `unpdf`) and DOCX parsing (`mammoth`) run inside the API or worker
  process. Inputs are size-checked and the ZIP directory is inspected first, but a parser bug could
  still affect that process. Run the worker as a separate container (as in `docker-compose.yml`) in
  production so ingestion is isolated from request handling.
- Adding a member requires an existing account; the "no account with that email" response lets an
  organization admin learn whether an email is registered.
- Without Redis, ingestion runs in the API process and queued work is lost on restart (production
  requires Redis).
- No automated dependency scanning beyond `pnpm audit` in CI.
- Email delivery depends on an SMTP provider; in development links are written to the API log.
