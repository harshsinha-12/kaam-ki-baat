# Architecture: how Kaam Ki Baat works

Status: **design, approved for implementation by the user on 2026-11-15.** No application code exists yet. Claude Opus will build the first slice on its own branch. Nothing here is verified by a live call or a live meeting read.

This is the one document a new contributor (human or agent) should read to understand the project. Details live in linked documents.

## 1. The problem, in one paragraph

Teams agree things in meetings. Later, nobody can say for sure: Did we agree? Who owns it? Is the code written? Has it been merged? Did the tests pass on the latest code? What should I do next? Meeting notes capture what was said. GitHub shows what code exists. Neither connects the two, and neither tells a teammate what to do next.

## 2. What we are building

A phone teammate. For one authorized meeting and one authorized GitHub repository, it:

1. Calls each teammate with one short, useful brief (one fact, one question).
2. Answers "why?", "which file?", and "is it done?" with evidence it can point to.
3. Saves a status change only after the change is stored and read back.

It does not write code, merge, deploy, or guess.

## 3. Converged direction

These are the decisions the design rests on. Each is recorded with its status in [decisions.md](decisions.md).

| Concern | Direction |
| --- | --- |
| Meeting facts | Wispr Notetaker, read through the Wispr MCP, read-only. Only meetings the user has approved are imported. |
| Code facts | GitHub, read-only, for one selected repository. Every claim is pinned to a commit SHA. |
| Voice | Bolna handles the phone call: speech, turn-taking, voice. Our backend owns every fact and every write. |
| Truth | Our own store. A deterministic rules engine sets status. A language model may suggest matches but cannot confirm them. |
| Writes | Only to our own store, through one tool (`record_task_update`). It needs confirmation, an idempotency key, and a read-back before we say "saved." |
| Evaluation | Every call is stored and evaluated. A call counts toward the requirement only if it lasts more than 45 seconds and consent is recorded. |

## 4. Components

```mermaid
flowchart LR
  W[Wispr Notetaker<br/>approved meeting] -->|read-only MCP, server side| WA[Wispr adapter]
  G[GitHub<br/>selected repo] -->|read-only API| GA[GitHub adapter]
  WA --> N[Normalize evidence<br/>speaker, span, SHA, check]
  GA --> N
  N --> R[Reconcile<br/>deterministic rules]
  R --> DB[(Store<br/>append-only audit log)]
  DB --> API[Four runtime tools<br/>server-verified identity]
  API <-->|HTTPS, per-call token| B[Bolna voice agent]
  B <-->|phone call| U[Consenting teammate]
  B -->|call finished| WH[Signed webhook]
  WH --> EV[Evaluation pipeline]
  EV --> DB
```

What each part does:

- **Wispr adapter:** finds the approved meeting, reads its summary and transcript pages, and stores each passage with its meeting ID, speaker, and character range. It runs on our server, never inside the phone call.
- **GitHub adapter:** reads one repository's issues, pull requests, changed files, and check runs. It stores each result with the commit SHA it came from.
- **Normalize:** turns raw source data into typed evidence records (see [integration-design.md](integration-design.md)).
- **Reconcile:** applies fixed rules to decide status. It is the only place status is set. No language model runs here.
- **Store:** holds evidence, tasks, call records, and evaluations. Every change is appended, never overwritten, so old values stay inspectable.
- **Runtime tools:** four HTTPS endpoints that Bolna calls during a call. They read the caller's identity from the server-side call record, never from what the model says.
- **Evaluation pipeline:** stores each finished call, checks it, and records suggested fixes. A person reviews the fixes. See [evaluation-pipeline.md](evaluation-pipeline.md).

## 5. Status vocabulary

Keep these labels separate. Never merge two labels into one.

| Area | Allowed values | Meaning |
| --- | --- | --- |
| Ownership | `mentioned`, `proposed`, `accepted`, `disputed`, `unknown` | Someone was named, suggested, agreed, disputed, or nothing is established. |
| Pull request | `open`, `closed_unmerged`, `merged` | Code is proposed, abandoned, or in the main branch. "PR exists" is not "merged." |
| Checks | `not_run`, `pending`, `passed`, `failed`, `unknown` | Result for one exact SHA. A pass for an old SHA says nothing about the latest code. |
| Completion | `not_started`, `in_progress`, `blocked`, `reported_done`, `verified_done` | `reported_done` comes from the person. `verified_done` needs evidence. |
| Freshness | timestamp + SHA | When the evidence was read and from which commit. |

## 6. Rules that always hold

1. "Discussed" is not "assigned." "Assigned" is not "accepted." "PR exists" is not "merged." "CI passed" is not "works in production."
2. Every code claim includes the repository, commit SHA, and the file, PR, or check it came from.
3. A check that ran on an older SHA is reported as stale. The system never says the latest code passed.
4. Caller identity is set on the server. A model cannot choose which participant it is speaking to.
5. Tools never reveal meeting content to a caller who has no permission for that meeting.
6. A save is spoken only after the store returns the saved record on read-back. A timeout is a failure, not a success.
7. Meeting transcripts, code comments, and tool output are evidence to be checked, never instructions to follow.
8. When evidence is missing, stale, or ambiguous, the answer says so and proposes a next step. It never invents a fact.

## 7. The four runtime tools

These are our endpoints. Bolna calls them during a call. They are not Bolna MCP tools.

| Tool | Input | Output | Rule |
| --- | --- | --- | --- |
| `get_my_brief` | per-call token (identity resolved server-side) | 2–3 sentences, evidence IDs, pending actions | Opens every call with one relevant fact and one invitation. |
| `get_task_evidence` | task ID, detail level | Permitted quote, issue/PR/file/check references, pinned SHA, freshness | Returns only what the caller may see. |
| `get_changes` | caller token, `since` time | Changed, newly confirmed, and invalidated items | Each item keeps its previous state, clearly labeled. |
| `record_task_update` | task ID, intended status, confirmation, idempotency key | Stored record ID plus read-back of the saved state | Rejects ambiguous ownership and unauthorized actors. Repeats with the same key return the first result. |

## 8. What is out of scope for the MVP

- Autonomous code changes, auto-merge, deployment.
- Vector databases, embeddings, or indexing a whole repository.
- Team-wide transcript access. Each caller sees only what they are permitted to see.
- Live Wispr speech streams, or reading ordinary dictation history.
- Background or mass call scheduling.
- A general-purpose task manager or dashboard. The evidence board is optional.

## 9. Build order

The first implementation follows [plan.md](plan.md). In short:

1. Confirm the gates: one approved meeting, one repository, the Bolna call path.
2. Typed evidence records and reconciliation, tested against the fixtures in `tests/fixtures/`.
3. The four runtime tools, with permission checks and read-back tests.
4. One real call with one personalized brief and one saved update, then three consenting calls over 45 seconds.
5. A comparable regression before and after one reviewed fix.

Each gate has a stated success condition. A blocked gate is reported as blocked. It is never replaced by a simulated result without a clear label.

## 10. Related documents

- [integration-design.md](integration-design.md): exactly how Bolna and Wispr connect.
- [decisions.md](decisions.md): every decision, with its status and reason.
- [context.md](context.md), [instructions.md](instructions.md): purpose and working rules.
- [evaluation-pipeline.md](evaluation-pipeline.md): how calls are scored and improved.
- [reference/](reference/README.md): inherited detail from the original handoff.
