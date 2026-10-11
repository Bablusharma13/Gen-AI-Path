# GenPath AI — AI Architecture

This document describes what is implemented. Items that exist in code but could not be exercised in
the development environment are marked **not verified**.

## 1. Layers

```
apps/api
  modules/ai/         mentor chat (SSE), hints, explanations, quotas, usage records
  modules/knowledge/  organizations, uploads, extraction, ingestion, vector stores, grounded answers
  modules/admin/      usage and cost reports, prompt catalogue
      │
      ▼
packages/ai-core
  llm/                (server only — import from '@genpath/ai-core/llm')
    types.ts          LlmProvider contract, GenerateRequest, StreamEvent, TokenUsage
    providers/        openai-compatible · anthropic (official SDK) · gemini · mock · scripted (tests)
    service.ts        LlmService: retries, fallback model, generate(), generateJson() with one repair
    errors.ts         AiProviderError with normalized codes
    models.ts         Anthropic model capabilities + verified prices; cost estimation
    sse.ts            SSE parsing shared with the browser
  prompts/            mentor.ts (chat, hint, explain, catalogue), rag.ts (rag.answer)
  embeddings/         EmbeddingProvider: local-hash (lexical, offline) · openai-compatible · gemini
  rag/                chunking.ts (heading-aware, overlap), retrieval.ts (hybrid ranking,
                      context assembly with delimited blocks, citation extraction + validation)
  labs/               deterministic simulations used by the interactive labs
```

The application depends only on the `LlmProvider` / `EmbeddingProvider` interfaces. Switching
providers is configuration (`AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`), not code.

## 2. Provider contract

```ts
interface LlmProvider {
  readonly id: 'openai-compatible' | 'anthropic' | 'gemini' | 'mock' | 'scripted';
  readonly isMock: boolean; // mock output is labelled in every UI that shows it
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>;
}
GenerateRequest = { model, system, messages: { role: 'user' | 'assistant'; content }[],
                    maxOutputTokens, effort?, temperature?, json?, signal? }
StreamEvent     = { type: 'text'; text } | { type: 'done'; usage; stopReason; model; fallbackUsed }
```

Stop reasons are normalized to `end | max_tokens | refusal | content_filter | other`. Errors are
normalized into `AiProviderError` with codes `NOT_CONFIGURED`, `AUTH`, `RATE_LIMITED`, `TIMEOUT`,
`BAD_REQUEST`, `MODEL_NOT_FOUND`, `UNAVAILABLE`, `CONTENT_FILTERED`, `INVALID_RESPONSE`, `ABORTED`.
The API maps them to learner-friendly messages; provider response bodies are logged truncated and
never shown to learners.

**Reliability (`LlmService`):** idle timeout (`AI_TIMEOUT_MS`) for the OpenAI-compatible and
Gemini providers — the request fails only if no data arrives for that long, so a slow local model
that keeps streaming is never cut off mid-answer (the Anthropic SDK applies its own timeout); retryable errors
(`RATE_LIMITED`, `UNAVAILABLE`, `TIMEOUT`) are retried once with exponential backoff and jitter, but
only before the first token has been streamed; `MODEL_NOT_FOUND` moves to `AI_FALLBACK_MODEL`;
aborts are never retried.

**Anthropic:** official SDK; `max_tokens` always set; `effort` only for models that accept it;
top-level prompt caching; server-side refusal fallback (`fallbacks: "default"`) enabled for models
that support it unless `AI_ANTHROPIC_SERVER_FALLBACK=false`; refusals end the answer with a notice
instead of showing partial text. **Not verified** against the live API (no key available) — covered
by recorded-response tests.

## 3. Prompt registry

Prompts are versioned TypeScript builders in `packages/ai-core/src/prompts`. Every AI call records
`promptId` and `promptVersion` in `aiInteractions`; changing a prompt means bumping its version.
The catalogue is shown to platform admins (Admin → AI usage).

| Prompt           | Output                                     | Safeguards                                                                     |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| `mentor.chat`    | Streamed Markdown                          | Learner context and lesson in delimited data blocks; history trimmed to budget |
| `mentor.hint`    | JSON `{hint, nextStep, concept}`           | Schema + one repair; solution-leak check; curriculum hint fallback             |
| `mentor.explain` | JSON concept card                          | Schema + one repair                                                            |
| `rag.answer`     | Markdown with `[n]` citations or NOT_FOUND | Sources and question delimited; citations validated in code                    |

Prompt tests (`*.test.ts` next to the prompts) assert structure: language rules, data delimiting,
injection text staying out of the system prompt, catalogue versions.

## 4. Learner context

Built **server-side** for the authenticated user (never trusted from the client): explanation
language, programming language, learning style, level, career goal, completed lessons, weak topics
(≥ 2 misses across ≥ 2 attempts), and the current lesson when one is named. With personalization
switched off in settings, only languages and mode are sent.

## 5. Teaching behaviour

Hinglish in Roman script by default (English or Devanagari Hindi on request), technical terms in
English, code in the learner's programming language, hints before solutions in practice, and
explicit uncertainty instead of invented facts.

## 6. Structured outputs

`LlmService.generateJson(request, schema)`: extract the first JSON object → `schema.safeParse` →
on failure one repair request listing the validation errors → on a second failure
`INVALID_RESPONSE`. Token usage is summed over both attempts. Nothing partially valid is rendered.

## 7. RAG pipeline (Knowledge Base)

```
upload (org admin) → validate: extension + declared MIME + magic bytes + size; ZIP directory
  checked for size/entry bombs before .docx is opened → store original (local disk or S3)
→ queue ingest job (inline in development, BullMQ + worker with Redis)
→ extract (txt/md as UTF-8, pdf via unpdf, docx via mammoth) → normalize
→ chunk: split on Markdown headings and sentences, ≤ KB_CHUNK_WORDS words, KB_CHUNK_OVERLAP_WORDS
  words of overlap, heading path kept per chunk
→ embed "heading › path\ntext" in batches → write chunks inactive → activate if still current

ask (any member) → embed question with the same model → vector search filtered by
  orgId + active + embeddingModel + visibility (+ optional document subset) inside the query
→ hybrid score = 0.7 × cosine + 0.3 × keyword overlap → top-k
→ below KB_MIN_SCORE: answer "not found" without calling the model
→ assembleContext: numbered <source> blocks within a 3,000-token budget, closing tags in
  document text neutralized, question in a <question> block
→ rag.answer → NOT_FOUND → "not in the documents"
             → citations validated: unknown [n] removed and reported; no valid citation → withheld
→ response lists the cited passages (plain text, never HTML)
```

Without an AI provider the endpoint returns the relevant passages, clearly labelled, instead of an
answer. The mock provider returns a labelled reply citing `[1]` so the pipeline can be developed
offline.

**Vector stores**

| Adapter         | When          | Notes                                                                                                                    |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `mongodb-local` | default       | Exact cosine in the API over the tenant-filtered chunks; scans at most 50,000 chunks per query. Fine for small corpora.  |
| `atlas`         | MongoDB Atlas | `$vectorSearch` with the same filter; scores converted back from Atlas's `(1 + cos) / 2`. **Not verified** (no cluster). |

Atlas index definition (collection `knowledgeChunks`, name `ATLAS_VECTOR_INDEX_NAME`; set
`numDimensions` to your embedding model's size):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "orgId" },
    { "type": "filter", "path": "active" },
    { "type": "filter", "path": "embeddingModel" },
    { "type": "filter", "path": "visibility" },
    { "type": "filter", "path": "documentId" }
  ]
}
```

**Embeddings.** `local-hash` is a deterministic lexical embedding (feature hashing of words and
character n-grams). It matches shared words, not meaning, and the UI says so on every answer.
Chunks are only compared with queries embedded by the same model; switching models requires
re-indexing documents (the old chunks simply stop matching). Semantic providers
(`openai-compatible`, `gemini`) are **not verified** here (no API key).

**Thresholds.** With `local-hash`, labelled test questions scored ≥ 0.37 when relevant and ≤ 0.16
when unrelated, so the default lexical threshold is 0.25. The semantic default (0.35) is an
uncalibrated starting point — score distributions differ per model. Use Knowledge Base → Retrieval
check with your own questions and set `KB_MIN_SCORE`.

## 8. Usage, quotas and cost

- One `aiInteractions` row per model call (feature, provider, model, prompt version, tokens,
  estimated-usage flag, latency, status, fallback flag) — no prompt or answer text.
- Daily per-user limit (`AI_DAILY_REQUEST_LIMIT`, shared by chat, hints, explanations and knowledge
  answers), max input characters, max output tokens, per-route rate limits.
- Cost is estimated only from verified Anthropic prices (as of 2026-10-06) or prices you configure
  in `AI_PRICING_JSON`; other models are counted as "unpriced", never guessed.

## 9. Evaluation

What exists:

- Deterministic checks in tests: schema validity, Hinglish/Devanagari language heuristics, hint
  solution-leak detection, citation validity, data-block delimiting, prompt-injection text kept out
  of system prompts.
- Scripted-provider tests for every failure path (timeouts, rate limits, refusals, truncation,
  invalid JSON, uncited answers, NOT_FOUND).
- A small labelled retrieval set in the knowledge-base tests that pins the lexical threshold.

Live smoke check: the OpenAI-compatible path has been exercised against a local Ollama model
(chat, hints, concept cards, cited knowledge answers, not-found). That proves the plumbing, not
answer quality: a 3B model produced weak Hinglish and at least one wrong numeric claim, which is
exactly why mentor answers are labelled as AI output and knowledge answers require valid citations.

Not built yet: a live-provider quality evaluation (it needs API keys and a request budget) and any
LLM-as-judge scoring. If added, judge scores must be reported as model opinions with the judge
prompt version and calibrated against human labels.
