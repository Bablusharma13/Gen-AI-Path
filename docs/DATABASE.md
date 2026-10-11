# GenPath AI — Database Design (MongoDB + Mongoose)

Principles:

- **Only collections that back a real feature.** Collections from the original wish-list that have
  no feature yet (billing, live sessions, batches, feature flags…) are intentionally absent.
- **Ownership in the query.** Data-access services always include `userId` and/or a tenant filter
  derived from the authenticated principal.
- **Bounded documents.** No unbounded arrays. Conversations are split into `chatSessions` +
  `chatMessages`; ingestion logs are capped; roadmap items are bounded by the course count.
- **Content uses stable string IDs** (`_id: "llm-tokens-context"`) so seeding is idempotent and
  progress survives content updates.
- **TTL indexes** clean up expiring data (sessions, auth tokens, learning events).

Database names: `genpath_ai` (dev), `genpath_ai_test_<random>` (tests, dropped after each suite).

## Accounts and access

### `users`

| Field                            | Notes                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `email`                          | lowercase, trimmed, **unique**                                                   |
| `passwordHash`                   | Argon2id, `select: false`, never serialized                                      |
| `name`                           | 1–80 chars                                                                       |
| `role`                           | `student` \| `instructor` \| `org_admin` \| `platform_admin` (default `student`) |
| `status`                         | `active` \| `suspended`                                                          |
| `emailVerifiedAt`, `lastLoginAt` | dates                                                                            |

Owner: the user (self) · Access: self, platform admins · Indexes: `{email:1}` unique, `{role:1}` ·
Retention: until account deletion.

### `sessions`

Refresh-token sessions. `refreshTokenHash` (unique), `previousTokenHash` (reuse detection),
`userId`, `userAgent` (truncated), `ipHash`, `lastUsedAt`, `expiresAt` (**TTL**), `revokedAt`,
`revokedReason`. Indexes: `{refreshTokenHash:1}` unique, `{previousTokenHash:1}`,
`{userId:1, revokedAt:1}`, `{expiresAt:1}` TTL.

### `authTokens`

Single-use email-verification and password-reset tokens: `userId`, `type`, `tokenHash` (unique),
`expiresAt` (**TTL**), `usedAt`.

### `profiles`

1:1 with users (`userId` unique). Onboarding answers and **independent** preferences:
`careerGoal`, `level`, `experience`, `programmingLanguages[]` (≤ 5), `primaryProgrammingLanguage`,
`explanationLanguage` (`hinglish`\|`en`\|`hi`), `learningStyle`, `dailyMinutes`, `theme`,
`accessibility { reducedMotion, fontScale }`, `mentor { personalizationEnabled, defaultMode }`,
`stats { xp, currentStreak, longestStreak, lastActiveDay }`, `onboardingCompletedAt`.

### `roadmaps`

1:1 with users. `items[]` (≤ number of courses): `{ courseId, status, reason, order, pinned }`
where status ∈ `completed | in_progress | recommended | available | locked | skipped`.
`generatedFrom` snapshots the onboarding inputs; `version` increments on regeneration.

### `organizations`, `memberships`

Tenant boundary for the knowledge base. `organizations { name, slug (unique), createdBy }`.
`memberships { orgId, userId, role: member|instructor|admin }`, unique on `(orgId, userId)`,
indexed on `userId`. Non-members get 404 for every organization route, so ids cannot be probed.
An organization always keeps at least one admin.

### `auditLogs`

`actorId`, `action`, `targetType`, `targetId`, `metadata` (no secrets), `requestId`, `ipHash`,
`createdAt`. Indexes `{createdAt:-1}`, `{actorId:1, createdAt:-1}`. Write-only for the app; read by
platform admins.

## Curriculum (seeded from `content/`)

### `courses`

`_id` (stable id), `slug` (unique), `version`, `status` (`draft`\|`published`), `level` (0–16),
`tracks[]`, `order`, localized `title`/`summary`/`description`, `outcomes`, `estimatedHours`,
`prerequisites[]` (course ids), `modules[] { id, title, summary, lessonIds[] }`, `contentHash`.

### `lessons`

`_id`, `courseId`, `moduleId`, `slug`, `order`, `version`, `status`, localized `title`, `summary`,
`objectives`, `sections` (explanation, analogy, visual, guided exercise, challenge, common mistakes,
project application, summary), `codeExamples[] { variants: { python, javascript, typescript } }`,
`lab` (lab id + config), `exerciseIds[]`, `assessmentId`, `prerequisites[]`, `relatedLessonIds[]`,
`estimatedMinutes`, `contentHash`. Indexes: `{courseId:1, order:1}`, `{slug:1, courseId:1}` unique.

### `assessments`

Questions embedded (≤ 50). Answer keys (`correctOptionIds`, rubric keyword groups, sample answers,
explanations) are stored with the questions but stripped by the service when a quiz is served; an
API test asserts none of them reach the browser before submission.

### `exercises`

Python exercises with starter code, visible tests, hints, and a reference solution (`solution` is
`select: false`; it is released only after enough attempts).

### `projects`, `interviewQuestions`

Seeded from `content/projects/*.yaml` and `content/career/interview-questions.yaml` with the same
`version` / `contentHash` / `archivedAt` rules as the curriculum.

## Learning progress

| Collection           | Key fields                                                                                           | Unique / indexes                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `enrollments`        | `userId, courseId, startedAt, completedAt, lastLessonId`                                             | `(userId, courseId)` unique                                              |
| `lessonProgress`     | `userId, lessonId, courseId, status, startedAt, completedAt, timeSpentSec, notes (≤10k), bookmarked` | `(userId, lessonId)` unique; `(userId, courseId)`; `(userId, updatedAt)` |
| `assessmentAttempts` | `userId, assessmentId, answers[], results[], score, maxScore, percent, passed`                       | `(userId, assessmentId, createdAt)`                                      |
| `exerciseAttempts`   | `userId, exerciseId, passed, testsPassed, testsTotal, verification: "client", hintsUsed`             | `(userId, exerciseId, createdAt)`                                        |
| `learningEvents`     | `userId, type, refId, courseId, title, topics[], xp, at`                                             | `(userId, at)`; TTL 365 days                                             |
| `interviewPractice`  | `userId, questionId, status (needs_practice\|confident\|null), notes (≤ 4k)`                         | `(userId, questionId)` unique                                            |

## AI and conversations

| Collection       | Key fields                                                                                                                                                                                                     | Indexes                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `chatSessions`   | `userId, title, mode, lessonId, messageCount, lastMessageAt`                                                                                                                                                   | `(userId, lastMessageAt)`                                   |
| `chatMessages`   | `sessionId, userId, role, content (≤ 20k), status, provider, model, isMock, usage`                                                                                                                             | `(sessionId, createdAt)`, `(userId, createdAt)`             |
| `aiInteractions` | `userId, feature (chat\|hint\|explain\|rag\|lab-embeddings), provider, model, promptId, promptVersion, inputTokens, outputTokens, usageEstimated, costUsd, latencyMs, status, errorCode, isMock, fallbackUsed` | `(userId, createdAt)`, `(feature, createdAt)`; TTL 400 days |

`aiInteractions` stores metadata only (no prompt or answer text) and drives quotas, usage and cost
reports. `costUsd` is null when the model has no verified or configured price.

## Knowledge base (RAG)

### `knowledgeDocuments`

`orgId`, `title`, `filename` (display only), `fileType` (txt\|md\|pdf\|docx), `sizeBytes`, `sha256`
(duplicate detection per organization), `storageKey` (server-generated:
`orgs/<orgId>/<documentId>/original.<ext>`), `visibility` (`members`\|`admins`), `status`
(`queued`\|`processing`\|`ready`\|`failed`), `error` (safe message), `indexVersion`, `chunkCount`,
`embeddingModel`, `dimensions`, `uploadedBy`, `processedAt`. Indexes `(orgId, createdAt)`,
`(orgId, sha256)`.

### `knowledgeChunks`

`orgId`, `documentId`, `indexVersion`, `active`, `visibility` (copied from the document), `ordinal`,
`text`, `headingPath[]`, `start`/`end` (character offsets), `embedding[]`, `embeddingModel`.
Indexes `(orgId, active, embeddingModel, visibility)` and `(documentId, indexVersion)`.

`orgId`, `active`, `embeddingModel`, `visibility` and `documentId` are filter fields in every
retrieval query (and must be declared as `filter` fields in an Atlas vector index).

**Re-index:** `indexVersion` is incremented and a job enqueued. The job writes chunks for that
version with `active: false`, commits only if the document's version is still the same, then
activates them and deletes every other version. A superseded or deleted job discards its output.

**Visibility change:** chunks are updated before the document, so retrieval is never more permissive
than the document record.

**Deletion:** chunks → stored original → document record. A job that races with a delete removes
any chunks it wrote.

## Projects

| Collection           | Key fields                                                                              | Indexes                                                 |
| -------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `projectProgress`    | `userId, projectId, status, milestones[] {id, completedAt}, xpAwardedMilestones[]`      | `(userId, projectId)` unique                            |
| `projectSubmissions` | `userId, projectId, repoUrl, demoUrl, notes, checklist[], status, feedback, reviewerId` | `(userId, projectId, createdAt)`, `(status, createdAt)` |

Project templates are content (`content/projects/*.yaml`), seeded into `projects`. XP is awarded
once per milestone (`xpAwardedMilestones`) and once per project (first submission), so un-ticking
or resubmitting cannot farm XP. Reviewer feedback is plain text.
