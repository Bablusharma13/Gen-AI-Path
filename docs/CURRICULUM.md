# GenPath AI — Curriculum

## 1. Structure

```
Course (level 0–16, tracks[])
 └─ Module (ordered)
     └─ Lesson (stable id, prerequisites, objectives, sections, code, lab, exercise, assessment)
```

Content lives in `content/curriculum/<course-id>/course.yaml` and
`content/curriculum/<course-id>/lessons/<lesson-id>.yaml`, validated by the Zod content schema in
`packages/shared/src/content.ts` (`pnpm content:validate`) and seeded idempotently
(`pnpm seed`). Changing a lesson means editing YAML and bumping `version`; reviewers see the diff
in the pull request.

### Lesson template (every important lesson)

1. Learning objectives · 2. Prerequisites · 3. Simple explanation (localized) · 4. Real-world analogy
   · 5. Visual explanation / lab · 6. Working code (Python / JavaScript / TypeScript variants)
   · 7. Guided exercise · 8. Independent challenge · 9. Quiz · 10. Common mistakes
   · 11. Project application · 12. Summary and revision

### Localization

Localized fields are objects: `{ hinglish: "...", en: "...", hi?: "..." }`. Hinglish (Roman
script) and English are required for seed content. If Hindi (Devanagari) is not yet written for a
lesson, the UI shows the Hinglish version with a visible notice and offers an AI Mentor explanation
in Hindi. The explanation language never changes the programming language of code examples.

## 2. Levels (full programme)

| Level | Title                              | Seeded now                                                                                       |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0     | Computer and Developer Foundations | ⬜                                                                                               |
| 1     | Python Programming                 | ✅ Python Foundations for AI — 2 modules, 6 lessons                                              |
| 2     | Mathematics and AI Foundations     | ✅ AI, ML and Vectors — 2 modules, 4 lessons (vectors, gradient descent, metrics)                |
| 3     | Machine Learning                   | ⬜                                                                                               |
| 4     | Deep Learning and Neural Networks  | ⬜                                                                                               |
| 5     | LLM and Transformer Fundamentals   | ✅ How LLMs Work — 3 modules, 4 lessons (tokens, next-token generation, attention, prompting)    |
| 6     | Prompt Engineering                 | 🟡 One lesson (prompts, injection, structured output) inside the level-5 course                  |
| 7     | Building GenAI Applications        | 🟡 Covered by the HTTP/JSON Python lessons and the Python API Assistant project                  |
| 8     | Embeddings, Vector Search and RAG  | ✅ RAG Fundamentals — 2 modules, 2 lessons (chunking + hybrid retrieval, grounding + evaluation) |
| 9     | Advanced RAG                       | ⬜                                                                                               |
| 10    | AI Agents and Tool Calling         | ⬜                                                                                               |
| 11    | Agent Frameworks and Orchestration | ⬜                                                                                               |
| 12    | Fine-Tuning and Model Adaptation   | ⬜                                                                                               |
| 13    | Production GenAI Engineering       | ⬜                                                                                               |
| 14    | ML Platform, Serving and MLOps     | ⬜                                                                                               |
| 15    | Multimodal and Emerging GenAI      | ⬜                                                                                               |
| 16    | Interview and Career Preparation   | 🟡 Career Center: 25-question interview bank (10 topics) and readiness checklist                 |

Totals: 4 courses, 9 modules, 16 lessons, 16 quizzes (56 questions), 16 Python exercises, 14
verified code examples. Every lab is used by a lesson: Tokens (level 5), Embeddings (level 2),
Attention (level 5), Gradient Descent (level 2), RAG Pipeline (level 8).

The ⬜ levels are designed but not authored. No placeholder lessons are seeded; unfinished levels
simply do not appear in the catalogue.

**Quality gate for content:** `pnpm content:validate` (schema + cross-references: ids, prerequisites,
cycles, lesson ↔ exercise ↔ quiz ↔ project links) and `pnpm exercises:verify` (each reference
solution passes and each starter fails its tests in real CPython; each code example prints exactly
its documented output). Both run in CI.

## 3. Career tracks

| Track                          | Required levels           | Recommended | Capstone                                                       |
| ------------------------------ | ------------------------- | ----------- | -------------------------------------------------------------- |
| A — GenAI Application Engineer | 1, 2, 5, 6, 7, 8, 13      | 9, 10, 16   | Multi-tenant RAG SaaS with evaluation and usage controls       |
| B — AI Agent Engineer          | 1, 2, 5, 6, 7, 10, 11, 13 | 8, 9, 16    | Tool-calling support agent with approvals and execution traces |
| C — ML/LLM Engineer            | 1, 2, 3, 4, 5, 12         | 8, 14, 16   | Fine-tuning experiment with evaluation report                  |
| D — AI Platform/MLOps Engineer | 1, 2, 4, 5, 13, 14        | 7, 8, 16    | Model-serving API with metrics, health checks and rollback     |
| E — Research Foundations       | 1, 2, 3, 4, 5, 12         | 14, 15      | Reproduction of a small paper result with ablations            |

The roadmap generator (`packages/shared/src/roadmap.ts`) is rule-based and transparent: it orders
courses by level, marks track-required courses, explains each recommendation, lets experienced
learners mark prerequisites as known (skip), and never hides a course permanently.

## 4. Assessment policy

- Every assessment declares objectives and a passing percentage.
- MCQ: deterministic scoring. Short answers: rubric keyword groups (each group = an idea that must
  be present, with accepted synonyms) — deterministic and explainable, with feedback naming the
  missing idea. LLM grading is not used for scores.
- A single failed attempt never labels a learner; weak topics come from repeated misses and are
  shown with the evidence so learners can challenge them.

## 5. Guided projects

Defined in `content/projects/*.yaml`: problem statement, requirements, prerequisite lessons,
acceptance criteria, architecture, data model, API design, milestones with checklists, test
requirements, security checklist, deployment, README requirements and a 100-point rubric. Seeded:

| Project                                          | Level        | Hours | Linked lessons                                |
| ------------------------------------------------ | ------------ | ----- | --------------------------------------------- |
| Python API Assistant (CLI)                       | Beginner     | ~6    | functions, files/JSON/errors, HTTP APIs       |
| Documentation Q&A Assistant (RAG) with citations | Intermediate | ~14   | vectors, metrics, HTTP APIs, both RAG lessons |
| AI Resume Analyzer with validated JSON           | Intermediate | ~10   | files/JSON/errors, HTTP APIs, prompting       |

Learners build in their own repository; GenPath tracks milestones and a self-assessed rubric
checklist, and instructors review submissions with written feedback. Nothing is auto-graded.

## 6. Interview question bank

`content/career/interview-questions.yaml`: 25 questions across Python, ML basics, LLM
fundamentals, prompting, RAG, agents, evaluation, system design, production and behavioural topics.
Each has key points, a sample answer, optional follow-ups and links to revision lessons, in English
and Hinglish. Learners mark questions "needs practice" or "confident" (their own judgement) and keep
private notes; the Career Center's readiness checklist counts real progress only and is explicitly
not a hiring prediction.
