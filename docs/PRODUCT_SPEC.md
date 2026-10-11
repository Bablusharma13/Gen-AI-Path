# GenPath AI — Product Specification

> **Tagline:** From Zero to Generative AI Engineer — Learn, Build, Deploy.

## 1. Problem

People who want to become GenAI engineers face scattered tutorials, video playlists with no practice,
and chatbots that answer questions without knowing what the learner already understands. Most
courses teach vocabulary, not mechanisms, and almost none make learners build, evaluate, and ship a
real AI system.

## 2. Core learning loop

**Learn a concept → Visualize it → Experiment with it → Implement it → Evaluate it → Build a real
project → Become job-ready.**

Every product decision should strengthen this loop. A feature that does not help a learner move
through it is out of scope for the MVP.

## 3. Users

| Persona                   | Starting point      | What they need first                                                 |
| ------------------------- | ------------------- | -------------------------------------------------------------------- |
| Absolute beginner         | No programming      | Developer foundations, Python, slow pace, Hinglish explanations      |
| Web developer             | JS/TS, APIs         | Skip Python basics via placement, LLM APIs, RAG, TypeScript examples |
| Python developer          | Python, no ML       | ML/AI foundations, embeddings, RAG, agents                           |
| Student / job seeker      | Mixed               | Projects, interview prep, portfolio                                  |
| Intermediate GenAI dev    | Has built a chatbot | Advanced RAG, evaluation, agents, production                         |
| Advanced learner          | ML background       | Fine-tuning, serving, MLOps                                          |
| Instructor / organization | Teaching others     | Courses, cohorts, learner progress (post-MVP)                        |

## 4. Product principles

1. **Understanding over memorization.** Explain mechanisms with analogies, visuals and experiments.
2. **Honesty.** Simulations are labelled as simulations. Mock AI output is labelled as mock. We never
   fake training runs, API calls, scores or certifications.
3. **Preferences are independent.** Explanation language (Hinglish / English / Hindi), programming
   language (Python / JavaScript / TypeScript), learning style, theme and accessibility settings never
   change each other silently.
4. **Learner control.** Roadmaps are editable, placement can bypass prerequisites, personalization
   can be viewed and switched off, conversation history can be deleted.
5. **Safety by construction.** Untrusted content (documents, model output, tool results) is data, not
   instructions. Student code never runs inside the API process.
6. **Free path through the core.** The core curriculum is usable without a subscription.

## 5. Feature scope

### MVP (this build)

- Accounts: register, login, logout, refresh-token rotation, password reset, email verification,
  RBAC (student, instructor, org admin, platform admin).
- Onboarding: career goal, level, experience, programming languages, explanation language, learning
  style, daily time → proposed, editable roadmap with explained prerequisites.
- Curriculum engine: versioned structured content in `content/`, courses → modules → lessons,
  prerequisites, progress persisted in MongoDB, lesson completion, notes/bookmarks.
- Assessments: multiple choice and short-answer questions scored on the server with rubrics; hidden
  answers until submission.
- Interactive labs (deterministic, tested): Tokens & Context, Embedding Similarity, Attention
  (simplified), RAG Pipeline, Gradient Descent.
- Python exercises that run in an isolated in-browser WebAssembly sandbox (Pyodide in a Web Worker)
  with visible test cases — no server-side arbitrary execution.
- AI Mentor: provider-agnostic (OpenAI-compatible incl. Ollama, Anthropic, Gemini), streaming chat,
  explain/hint modes, learner-context aware, quotas, usage and cost tracking, graceful failures.
- Knowledge base (RAG): admin upload → background ingestion → chunking → embeddings → vector search
  with tenant/permission filtering → grounded answers with validated citations.
- Guided projects with requirements, milestones, acceptance criteria, submissions and instructor
  review.
- Career Center: readiness checklist computed from real progress (never a hiring prediction) and
  an interview question bank with key points, sample answers and private practice notes.
- Admin: users and roles, AI usage and cost, project reviews, audit logs, prompt catalogue.
  Organization admins manage their knowledge documents and members on the Knowledge Base page.
- Dashboard: continue learning, progress, weak topics, recommendations, streak and XP.

### Post-MVP (see `ROADMAP.md`)

Server-side sandboxed code runner, instructor course authoring UI, cohorts/batches, mock interviewer
with rubric scoring, billing, live classrooms, leaderboards, LangGraph-style agent labs, fine-tuning
labs with real compute, multimodal modules.

## 6. Career tracks

After the shared foundations (Levels 0–2 and the GenAI core of Levels 5–7), learners pick a primary
track. Track definitions, prerequisites and capstones live in `CURRICULUM.md`.

- **A — GenAI Application Engineer**
- **B — AI Agent Engineer**
- **C — ML/LLM Engineer**
- **D — AI Platform/MLOps Engineer**
- **E — AI Research Foundations**

## 7. Success metrics (to be measured, not assumed)

- Activation: % of registered users who complete onboarding and one lesson.
- Learning: lesson completion rate, assessment pass rate on second attempt, lab usage.
- Building: % of learners who submit a guided project.
- AI quality: mentor answer helpfulness (thumbs up/down), RAG citation-validity rate, provider error
  rate, cost per active learner.

## 8. Non-goals

- Guaranteeing employment or issuing accredited certificates.
- Hosting or training large models on platform infrastructure in the MVP.
- Rendering AI-generated HTML/JS or executing AI-generated code on the server.
