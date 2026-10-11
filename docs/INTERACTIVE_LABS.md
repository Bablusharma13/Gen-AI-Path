# GenPath AI — Interactive Labs

## 1. Principles

- **Deterministic:** the same fixture + configuration always produces the same steps. Lab logic is
  pure TypeScript in `packages/ai-core/src/labs/` and unit-tested.
- **Honest:** every simplification is labelled on screen. A 2D projection, a toy attention matrix or
  a lexical embedding is never presented as a production model's internals.
- **Renderer-owned:** labs emit validated data (`LabStep` events). React components decide how to
  draw them. Nothing AI-generated is rendered as HTML or executed.
- **Accessible:** all controls are keyboard operable, have labels, respect `prefers-reduced-motion`
  and the in-app reduced-motion setting; visual encodings have text equivalents (tables, values).

## 2. Step event contract

Defined in `packages/shared/src/labs.ts` (Zod):

```ts
LabStep = {
  id: string;                 // stable within a run
  title: string;
  description: string;
  stage: string;              // e.g. 'chunk' | 'embed' | 'retrieve'
  state: Record<string, JsonValue>;   // inspectable snapshot
  highlights: string[];       // ids of elements to emphasise
  codeLine?: number;          // optional line in the companion code sample
}
```

The `StepPlayer` component provides Play, Pause, Previous, Next, Replay, Speed (0.5×–2×), Reset and
"Inspect state" (JSON view of `state`).

## 3. Labs

| Lab                        | What is real                                                                                                                       | What is simplified                                                                                                                                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokens & Context**       | Real BPE tokenization with `js-tiktoken` encodings (`o200k_base`, `cl100k_base`); real token IDs and counts                        | Other providers (Claude, Gemini, Llama) use different tokenizers — counts are labelled as estimates for them. Context window numbers are illustrative inputs the learner controls.                                                                                                                            |
| **Embedding Similarity**   | Real cosine similarity and real PCA (power iteration) on the vectors shown                                                         | Offline mode uses `local-hash` embeddings (feature hashing of words + character n-grams) which capture word overlap, not meaning. When an embedding provider is configured, the lab can request real model embeddings through the API. The 2D projection distorts high-dimensional distances (warning shown). |
| **Attention (simplified)** | Real scaled dot-product attention math (QKᵀ/√d → softmax → ·V) on small matrices                                                   | Toy 8-dimensional embeddings and fixed projection matrices, single head, no positional encoding — not weights from a real model.                                                                                                                                                                              |
| **RAG Pipeline**           | Real chunking (size/overlap), real local-hash embeddings, real cosine ranking, real context assembly on a fixed educational corpus | The answer is always extractive (best-matching sentences with their citation numbers); the lab never calls a model. The Knowledge Base feature shows the LLM-written, citation-validated version.                                                                                                             |
| **Gradient Descent**       | Real gradient descent on a 1-feature linear regression with MSE loss                                                               | Tiny synthetic dataset.                                                                                                                                                                                                                                                                                       |

## 4. Python exercise runner

- Pyodide (CPython → WebAssembly) loaded inside a dedicated Web Worker.
- Each run: fresh namespace, stdout/stderr captured and size-capped, wall-clock timeout (worker is
  terminated and recreated on timeout), test cases executed after the learner's code.
- Results are shown as passed/failed per test with the assertion message.
- Results are recorded on the server as `verification: "client"` — useful for progress, not for
  formal grading.

## 5. Adding a lab

1. Write the pure simulation in `packages/ai-core/src/labs/<lab>.ts` returning data or `LabStep[]`.
2. Add unit tests (`*.test.ts`) asserting determinism and key numeric properties.
3. Build the UI in `apps/web/src/features/labs/<lab>-lab.tsx` using `StepPlayer` where stepwise,
   validating its `config` with a Zod schema and falling back to defaults.
4. Add the id to `LAB_IDS` in `packages/shared/src/content.ts`, render it in
   `apps/web/src/features/labs/lab-renderer.tsx`, and describe it in `features/labs/meta.ts`.
5. Reference it from a lesson with `lab: { id: "<lab>", config: {...}, prompt: {...} }`.
6. Add the "what is simplified" disclaimer text.

## 6. Where each lab is used

| Lab              | Lesson                                                              |
| ---------------- | ------------------------------------------------------------------- |
| Tokens & Context | How LLMs Work → Tokens, context windows and cost                    |
| Embeddings       | AI Foundations → Vectors, dot products and cosine similarity        |
| Attention        | How LLMs Work → Self-attention                                      |
| Gradient Descent | AI Foundations → Loss functions and gradient descent                |
| RAG Pipeline     | RAG Fundamentals → The RAG pipeline — chunking and hybrid retrieval |
