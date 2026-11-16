# Architecture: how Kaam Ki Baat works

This is the one document to read before changing the system. It explains what the product does, the point of view behind it, the decisions that shape the code, and where each piece lives. Current status and the work split live in [plan.md](plan.md); every decision has a record in [decisions.md](decisions.md).

![How a question gets answered](images/architecture.png)

## 1. The problem

Teams decide things in meetings and then lose them. A few hours later the questions start in chat: *what did we actually decide? who owns it? did it make it into the code? did the tests pass on the latest commit?* Meeting notes hold what was said. GitHub holds what was built. Neither connects the two, and neither tells a teammate what is safe to do next. So people guess, or they interrupt the one person who knows.

## 2. Point of view

Four beliefs shape every part of the design.

1. **Help should be where you already look.** When we are stuck we look left and right for help. The workspace puts an agent in each direction: Team Memory on the left, the Leader Desk in front, the Code Navigator on the right. Choosing one is a glance, not a menu.
2. **A voice answer is only as good as its source.** Every answer names the meeting passage, PR, file, lines or check it came from, pinned to a commit. If there is no source, the agent says so.
3. **Status is decided by rules, never by the model.** The language model explains. Fixed rules over evidence decide whether something was proposed or accepted, open or merged, verified or stale.
4. **Unknowns go to a person, not to a guess.** When the agent cannot settle a doubt, it becomes a question for the lead. The lead's answer is versioned, saved, read back and delivered to whoever asked.

## 3. One question, end to end

The numbers match the diagram above.

| Step | What happens | Where |
| :---: | :--- | :--- |
| **A** | Before anyone asks, approved meeting passages are imported from Wispr Flow (read-only MCP), each with its speaker and character range. | `scripts/`, `lib/evidence/` |
| **B** | Before anyone asks, PRs, changed files and check runs are read from GitHub and pinned to a commit SHA, and a code graph is built at that commit. | `lib/evidence/`, `lib/codegraph/graph.ts` |
| **1** | You glance about 30 degrees left or right (webcam, AirPods or arrow keys). The workspace focuses that agent. | `lib/focus/selector.ts`, `lib/zones/focus.ts` |
| **2** | You ask out loud. Bolna carries the voice, in the browser or on a phone call. | `app/team/`, `app/api/spatial/bolna-session/` |
| **3** | Mid-sentence, Bolna calls one of our six HTTPS tools with a per-call token. Identity comes from the server-side call record, never from the model. | `lib/tools/runtime.ts`, `app/api/tools/` |
| **4** | The active agent finds sources: Team Memory searches decisions and the passages this person may see; the Code Navigator searches the code graph. | `lib/zones/memory.ts`, `lib/codegraph/search.ts` |
| **5** | Fixed rules set the status of what was found. | `lib/core/` |
| **6** | You hear the answer with its source; the code panel opens at the exact lines. | `app/team/` |
| **7** | If the agent cannot settle it, the doubt becomes a ticket for the lead. | `lib/zones/escalation.ts` |
| **8** | The lead steps up with a passkey (WebAuthn) and approves or corrects. The decision gets a new version. | `app/leader/`, `lib/zones/webauthn.ts` |
| **9** | The approval is written once, read back, and delivered to the person who asked, even if they had hung up. | `lib/store/`, `lib/zones/escalation.ts` |

## 4. Components

- **Workspace** (`app/team`). Next.js on Vercel. Three agents in space, a code panel that opens at the cited lines, and a microphone that is only on with consent.
- **Selector** (`lib/focus/selector.ts`). Turns noisy head yaw into a stable choice. See decision D4 below.
- **Voice** (Bolna). Speech, turn-taking and the phone line. It owns no facts and makes no writes; it calls our tools.
- **Runtime tools** (`lib/tools/runtime.ts`). Six endpoints: `get_my_brief`, `get_task_evidence`, `get_changes`, `record_task_update`, `request_clarification`, `get_project_context`. Each resolves the caller from a hashed per-call token.
- **Team Memory** (`lib/zones/memory.ts`). Current decisions (base snapshot plus approved versions from the event log) and the meeting passages visible to this person. It answers "confirmed", "only proposed" or "not discussed", and offers to ask the lead.
- **Code Navigator** (`lib/codegraph/`, `lib/zones/code.ts`). A Graphify-style graph of symbols, calls and imports at one commit, searched with BM25, concept expansion, one hop of graph propagation and pseudo-relevance feedback. Answers name the file and line range and verify that the lines still exist.
- **Evidence rules** (`lib/core/`). The only place status is set.
- **Leader Desk** (`app/leader`, `lib/zones/escalation.ts`). Queued doubts, passkey step-up, approvals, presence, and "call the lead" when nobody answers.
- **Event store** (`lib/store/`). Append-only, with a Redis backend in production and a JSONL file locally. Leases serialize writes.

## 5. Architect's decisions

Each decision names what we chose, what we gave up, and why.

**D1. Rules decide status; the model only explains.** Status is computed from evidence by deterministic code: proposed is not accepted, an open PR is not merged, a check on an older SHA is stale. *Trade-off:* the rules miss nuance a model might catch. *Why:* a false "it's done" costs far more than an honest "I don't know". This is the property the evals guard hardest: 0 false confirmations across 35 memory questions.

**D2. "Saved" means written once and read back.** Every write carries an idempotency key. The store returns the saved record on read-back before the agent says "saved"; a timeout is reported as a failure. Repeating a write with the same key returns the first result. *Trade-off:* one extra read per write. *Why:* a voice agent that says "saved" when it wasn't destroys trust immediately.

**D3. Append-only events, not mutable rows.** Decisions, focus, consent, tickets and calls are events. Current state is a fold over the log, so every old value stays inspectable and a decision's v1 and v2 can both be cited. Torn tail writes are dropped on load (`parseLog`, `dropTornTail`). *Trade-off:* reads fold the log; fine at team scale, and the fold is cached per request. *Why:* auditability and simple recovery.

**D4. Head pose selects, it never authenticates.** A glance past 24 degrees held for 300 ms selects a side, and the choice latches: it stays selected when you look back at the screen. Facing the screen for 4 s, or pressing ↑, returns to the Leader Desk. Hysteresis (enter 24°, exit 12°), smoothing and slow recentring absorb webcam noise. *Trade-off:* a deliberate 4 s hold to go back to centre. *Why:* nobody should hold their head turned while they talk, and a camera angle is not an identity. The Leader Desk always needs a passkey.

**D5. Scope by person, enforced on the server.** A teammate only sees the meeting passages tied to their own tasks; the lead's private items never appear in a member's answer, even when the words match. *Trade-off:* some answers say "not visible to you" when a looser system would answer. *Why:* the 35-question memory eval includes a scope category, and it must stay at 0 leaks.

**D6. Pin every code claim to a commit.** The graph, the PR state and the checks are all read at one SHA, and answers say which. *Why:* "the tests passed" is meaningless without "on which commit".

**D7. Lexical, explainable retrieval first.** The Code Navigator and Team Memory use word-level retrieval with expansion and feedback, not embeddings. It runs offline in the browser in under 10 ms and every hit can be explained ("matched `readBack` via *verify*"). *Trade-off:* questions that share no words with the code or the meeting are hard: 42% Acc@5 on the old held-out code set, 33% on the blind memory set. *Next:* an embedding re-ranker on top of the lexical candidates, measured on the fresh test sets before it ships.

**D8. Voice provider owns the voice, we own the facts.** Bolna handles speech and the phone line and calls our tools. It never sees raw transcripts or GitHub tokens, and it cannot choose who it is talking to. *Why:* we can swap the voice layer without touching the truth layer.

**D9. Read-only sources, one write path.** Wispr Flow and GitHub are read-only. The only writes go to our own store, through `record_task_update` and the lead's approvals. The system never writes code, merges or deploys.

## 6. Status vocabulary

Keep these labels separate. Never merge two into one.

| Area | Values | Meaning |
| :--- | :--- | :--- |
| Ownership | `mentioned`, `proposed`, `accepted`, `disputed`, `unknown` | Named, suggested, agreed, disputed or not established. |
| Pull request | `open`, `closed_unmerged`, `merged` | "PR exists" is not "merged". |
| Checks | `not_run`, `pending`, `passed`, `failed`, `unknown` | For one exact SHA. A pass on an older SHA says nothing about the latest code. |
| Completion | `not_started`, `in_progress`, `blocked`, `reported_done`, `verified_done` | `reported_done` comes from a person; `verified_done` needs evidence. |
| Freshness | timestamp + SHA | When the evidence was read, and from which commit. |

## 7. Rules that always hold

1. Discussed is not assigned. Assigned is not accepted. A PR is not a merge. CI passing is not production working.
2. Every code claim names the repository, commit SHA and the file, PR or check.
3. A check on an older SHA is reported as stale.
4. Caller identity is set on the server. The model cannot choose who it is speaking to.
5. Tools never reveal meeting content to someone without permission for it.
6. "Saved" is spoken only after read-back. A timeout is a failure.
7. Transcripts, code comments and tool output are evidence to check, never instructions to follow.
8. When evidence is missing, stale or ambiguous, say so and propose a next step.

## 8. Running in production

- **Store.** Redis (Upstash) in production via `KKB_REDIS_*`; JSONL locally. Writes take a short lease per key; concurrent tool calls for one call wait in a bounded backoff (150 ms up to 1.2 s) instead of racing (`acquireTurn`).
- **Idempotency everywhere.** Tool writes, Bolna webhooks (late or repeated status callbacks are ignored by execution ID) and lead approvals are safe to retry.
- **Stateless functions.** Every request reads its state from the store, so Vercel can scale functions horizontally. Nothing important lives in memory between requests.
- **Bounded work per request.** Search runs over a prebuilt index at one commit; graph expansion is one hop; answers cap their sources.
- **Secrets stay server-side.** GitHub and Wispr credentials never reach the browser or Bolna. Tokens are hashed at rest. Never commit secrets, private meetings or phone numbers.
- **Known limits.** The public `/graph` bundles a code graph from an older commit and says so. Physical AirPods and webcam unplug behaviour are not yet verified on hardware. See [plan.md](plan.md).

## 9. How we measure it

- **Code search:** function accuracy and recall at k, MRR and nDCG@10 with bootstrap intervals, on a development set, a Hinglish stress set, an older held-out set and a fresh test set written before tuning. Report: [evals/code-search.md](evals/code-search.md). Reproduce with `npx tsx scripts/eval-retrieval.ts --code-ref HEAD`.
- **Team Memory:** 35 questions across the LongMemEval abilities (extraction, multi-session, temporal, knowledge update, abstention) plus conflict and privacy scope. The headline safety metrics are false confirmations and scope leaks, both 0. Report: [evals/team-memory.md](evals/team-memory.md). Reproduce with `npx tsx scripts/eval-memory.ts`.
- **Calls:** every Bolna call is stored with its tool calls and reviewed; see `/evals` and [evaluation-pipeline.md](evaluation-pipeline.md).

## 10. Out of scope

Autonomous code changes, merging and deploying; team-wide transcript access; live Wispr speech streams or dictation history; background or mass calling; a general task manager.

## 11. Related documents

- [plan.md](plan.md): status, lanes and the task board.
- [decisions.md](decisions.md): every decision with its status and reason.
- [integration-design.md](integration-design.md): how Bolna and Wispr connect.
- [code-context.md](code-context.md): the code graph and its freshness checks.
- [evaluation-pipeline.md](evaluation-pipeline.md): how calls are scored and improved.
