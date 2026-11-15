# Kaam Ki Baat — BUILD PLAN (single source of truth)

**Every agent (Claude, Codex) and every human reads this first and updates it after each meaningful change.**
Rules live in [AGENTS.md](../AGENTS.md). Design lives in [architecture.md](architecture.md). Decisions live in [decisions.md](decisions.md). This file is *status + who does what next*.

Hackathon build window: **1–4 PM IST, 2026-11-15** ([competition.md](competition.md)).

## 0. Goal of the demo (the vertical slice)

> **One approved Wispr meeting → one codebase finding → one exact code pointer → one personalized Bolna call → one verifiably saved action.**

Demo script (≈90 s, must be >45 s on Bolna's own log):
1. Kaam Ki Baat calls a consenting teammate. `get_my_brief` → *"In <meeting>, the team agreed: X. The selected PR is <current PR state>. Want me to show you where the code is?"*
2. Caller interrupts: *"Ruko — code kahan hai?"* → Fix Navigator: file, function, line, test. Then *"Also, before I forget: …"* (unfinished fact resumes).
3. *"Did CI pass?"* → Evidence Verifier: checks on the **current** SHA, or "that result is for an older commit".
4. *"Mark it in progress."* → confirm → `record_task_update` → *"Saved, and I read it back."*
5. The board at `/?key=…` shows the three cards lighting up left → center → right with SHA-pinned links.

## 1. Branches and lanes

| Branch | Purpose | Who merges |
| --- | --- | --- |
| `main` | Reviewed work only. Latest reviewed main documentation baseline is `17de40b`, containing merged PR #10 at `f7100a6`. | User |
| `feat/evidence-core-spatial-specialists` (**PR #2**) | Merged into `main` at `457a6a0` by the user on 2026-11-15. | User |
| `codex/demo-readiness` (**PR #8**) | Merged into `main` at `4d72575` on 2026-11-15. | User |
| `docs/spatial-live-context-v2` (**PR #9**) | Merged into `main` at `c64d8bc` on 2026-11-15. Documentation only. | User |
| `codex/spatial-website-agent` (**PR #10**) | Merged into `main` at `f7100a6` on 2026-11-15. | User |
| `codex/graphify-context` | G2: optional Graphify retrieval for code knowledge transfer, based on fetched `origin/main` `99d0f78` after preserving PRs #11/#14. | User |
| `claude/<topic>` | Claude lane work → PR into `main` | — |
| `codex/<topic>` | Codex lane work → PR into `main` | — |

Before starting: `git fetch && git checkout -b codex/<topic> origin/main`. Rebase on `main` before opening a PR. Small PRs, merged often (every 30–40 min).

### File ownership (avoid conflicts)

| Area | Owner | Files |
| --- | --- | --- |
| Domain core, auth, store, specialists, runtime tools | **Claude** | `lib/core/**`, `lib/store/**`, `lib/auth/**`, `lib/specialists/**`, `lib/tools/**`, `app/api/tools/**`, `scripts/create-call.ts`, their tests |
| UI board, GitHub adapter, snapshot builder, CI, Bolna agent config, evaluation recorder | **Codex** | `app/page.tsx`, `app/components/**`, `lib/adapters/**`, `scripts/build-snapshot.ts`, `.github/**`, `docs/bolna/**`, `lib/eval/**`, `scripts/eval-*.ts`, their tests |
| Shared — edit in small, separate commits and note it in §5 | both | `lib/contracts.ts`, `package.json`, `docs/plan.md`, `docs/decisions.md` |
| Private data — **never committed** | user + whichever agent imports | `data/private/**`, `data/runtime/**`, `.env.local` |

## 2. How the system works (one screen)

```
Wispr MCP ──(agent reads ONE approved meeting)──> data/private/meeting.json ─┐
local git @ SHA + GitHub REST (PR, checks) ─────> scripts/build-snapshot.ts ─┴─> data/private/snapshot.json (LIVE) | data/demo/snapshot.fixture.json (FIXTURE)
                                                                                    │
Bolna call ──POST /api/tools/{tool} (Bearer KKB_TOOL_KEY, body.call_token)──> lib/tools/runtime.ts
   get_my_brief · get_task_evidence(focus: find|locate|verify, question) · get_changes · record_task_update
        │ resolveCaller (server-side token → participant → authorized tasks)
        ├─ orchestrator: Code Scout (left) · Fix Navigator (center) · Evidence Verifier (right)
        │    shared taskId + contextVersion; communication ledger resumes unfinished facts
        └─ EventStore: append-only data/runtime/events.jsonl (idempotent writes, fsync, read-back)
Board UI  /?key=KKB_BOARD_KEY  ← GET /api/board (cards only, no transcripts)
```

- **Code Scout** — on G2, an optional Graphify index retrieves source symbols plus bounded one-hop dependencies; missing/stale/unmatched graphs fall back to the keyword scan. Direct matches are `confirmed` only if their file is changed in the task's PR. Graph-related matches stay `candidate`. See [code context](code-context.md).
- **Fix Navigator** — target file + enclosing function + line + nearest test + `npm test -- <file>`; GitHub permalinks pinned to SHA. Never edits code.
- **Evidence Verifier** — `lib/core/reconcile.ts` (deterministic): ownership state, PR open/merged, checks on the *current* SHA vs stale, last saved update. Never says "works in production".

## 3. Current status — last verified 2026-11-15 (Codex live-demo worktree; merged PR #10 and main documentation update retained)

Baseline now includes merged PR #11 (`f4b1e71`), preserving PR #10 and main’s `016a313` event-log path fix. The earlier checkout recheck is preserved in the change log. All calls are held under D-038 for the final named-participant confirmation. The private import/runtime/configuration evidence below belongs to `/Users/harshsinha/kaam-ki-baat-github`; private files do not travel with Git. No relational database, camera selection or leader passkey is implemented. PR #11 adds a tested text-event/leader backend; actual microphone/STT-provider and leader UI integration remain unverified.

| Thing | State | Evidence |
| --- | --- | --- |
| Domain core + 4 runtime tools + 3 specialists | **Implemented** | `lib/**`, commit on PR #2 |
| Unit + vertical-slice tests | **86/86 pass** after PR #12/main integration (`tsx --test`, Node 20.20.0) | Includes the opening-brief merge regression, browser-start mock and all PR #11 scope/retry regressions |
| Core typecheck (`tsconfig.core.json`) | **Pass** | local `npm run typecheck`, TypeScript 5.9 |
| Install, full typecheck, production build locally | **Pass**: `npm install`, `npm ci`, `npm run typecheck`, `npm run build` | Node 20.20.0; `package-lock.json` pins dependencies; Next.js 15.5.29 |
| CI workflow | **Passed** on merged PR #11 head `0adfd8e`; PR #12 updated-head CI pending | Local 86 tests, full typecheck, production build and isolated HTTP smoke pass |
| GitHub adapter (live) | **Verified live read** on G1 branch: PR #2 merged, with head and merge-SHA checks | Fixture snapshot at `3795e28`: 28 files, 1 PR, 3 checks; meeting remains synthetic |
| Demo dry run (real tool handlers, no Bolna) | Works; output reviewed | `npm run demo:dry` — NOT call evidence |
| Developer MCP connections | **Reconnected and catalogs verified live**: Bolna 121 tools; Wispr 16 tools | Codex configuration + remote MCP initialize/tools-list; Bolna account read passed. See [integrations.md](integrations.md) |
| Wispr: approved meeting read end-to-end | **Verified LIVE**: complete transcript read; five exact hashed passages retained privately; Speaker 1 confirmed by user | `data/private/meeting-import.json`; no asserted PR match to this repository |
| HTTP callback path | **Verified with FIXTURE data**: 11 local HTTP checks passed; public HTTPS unauthenticated POST returned 401 | Auth, brief, evidence, save/read-back, replay, ownership refusal, changes and board; NOT telephone evidence |
| Bolna agent configuration | **Created and persisted read-back verified**: six functions, callbacks/auth/token mapping, spatial prompt and dynamic opening | [redacted profile](bolna/agent-profile.redacted.json); audio/context forwarding in a call remain unverified |
| Evaluation recorder + board polish | **Recovered and implemented** from PR #6 without replacing PR #7 adapter | `lib/eval/recorder.ts`, `scripts/eval-call.ts`, `app/page.tsx`; real-call evaluation pending |
| Real calls >45 s (need 3) | **0** | — |
| Spatial browser workspace + Bolna relay | **Implemented; synthetic local checks pass** | `app/components/SpatialWorkspace.tsx`, `app/api/spatial/**`, `lib/spatial/**`; [setup and limits](bolna/spatial-browser.md). No browser visual/mic QA or provider call tested; Leader Desk locked, AirPods deferred |

## 3a. Distance to the final product

The browser slice from PR #10 is implemented; the larger [spatial v2 proposal](spatial-live-context-v2.md) still includes future camera, passkey, live-STT and native headset work. Text/HTTP previews and configured tools are not real voice-call evidence.

| Product step | Where it is specified | What the checkout shows |
| --- | --- | --- |
| 1. Authorized meeting, repository, participants, storage, callback | Milestone 1 and [context.md](context.md) | Source/repository and owner speaker mapping confirmed; complete approved Wispr read and private LIVE snapshot verified. JSONL storage and public HTTPS callback verified. Other testers/phone consent and numbers remain pending. |
| 2. Small service and typed evidence | Milestone 2 | Implemented and tested; provenance retains source version, exact passage spans/hashes and immutable repository SHA. No relational database. |
| 3. One brief and one verified task update | Milestone 3 | Nine-turn LIVE-source TEXT_PREVIEW passes with isolated persisted save/read-back and safe retry. No live task status was changed by the preview. |
| 4. Live voice tools on a real call | Milestone 4 and [integrations.md](integrations.md) | Agent created, six callbacks/configuration read back, browser consent + opening brief + execution correlation implemented. Actual audio/context forwarding and DOM timing await a consenting call. |
| 5. Stored evaluation and reviewed fix between calls | Milestone 5 and [evaluation-pipeline.md](evaluation-pipeline.md) | Recorder merged; no completed real call evaluation or V1/V2 voice replay yet. Generic-query retrieval defect was fixed from a text preview, not a phone call. |
| 6. Evidence board and demo record | Milestone 6 | Board/spatial workspace implemented and owner access prepared privately. No real-call demo record or deployment. |

Next product gate: obtain ONE final user confirmation naming the specific consenting participant; all calls remain held until then. After that confirmation, the named participant may explicitly start a recorded browser test. Then retrieve the execution through the persisted correlation, evaluate it, and review a focused fix. Three consenting telephone calls over 45 seconds remain unverified; deployment/merging remain user-controlled.

## 3c. PR #11 merge review — 2026-11-15

User explicitly authorized conflict resolution and merge. Integrated incoming main `016a313`, preserving its centralized blank event-log-path handling and regression test. The prior 82-test head `7700dad` passed both CI checks; the current merge adds the main regression for 83 tests. Codex preserved the incoming main status reconciliation, fixed callback-result typing and decision-ID collisions, and reproduced four failing regressions before fixing them: cross-meeting live remarks, narrowed-call clarification disclosure, missing expected decision versions and idempotency-key collisions. Further review added source-backed decision gating, participant-only passage filtering, one-use/rate-limited leader codes, sharing-withdrawal checks, session-scoped utterance revisions, a single durable decision/ticket resolution event, bounded JSON/method guards and finalizing-to-completed callback handling. Leader codes remain a demo verifier, not WebAuthn. The final review also reproduced and fixed matching ticket retries after the leader had answered: idempotency now runs before current-memory rejection under the write lock, ticket creation is read back, and telephone retries report the saved answer rather than saying the send failed.

`npm ci`, 83/83 synthetic tests, full typecheck, production build and `npm run smoke:zones` pass locally. The HTTP smoke starts its own temporary production server/synthetic store, verifies leader gates and persisted read-back through a fresh store instance, and shuts it down; it does not touch the private live server or contact a provider. Install audit reports existing Next/PostCSS advisories whose suggested fix is a major Next upgrade; no forced framework upgrade was applied during this merge. Live microphone, provider calls, hardware gestures and passkeys remain unverified.

## 3d. Graphify code context — 2026-11-15

Implemented on `codex/graphify-context` (initial implementation `673a928`, rebased onto fetched `origin/main` `99d0f78`; follow-up files `lib/zones/code.ts`, `tests/graphify-context.test.ts` and [setup](code-context.md)). This is branch evidence, not a merge or deployment claim. `context:build` verifies selected code against the pinned Git commit, stages only those files, runs local code-only Graphify extraction, and atomically writes an ignored graph. A repository/SHA/content-bound index supports bounded source/dependency retrieval with keyword fallback. Graph provenance reaches both phone-task evidence and the device Code Navigator. Meeting and task authorization remain in the existing server-owned tools.

Verification: **91/91 tests pass**, full `npm run typecheck`, production `npm run build`, local documentation links and `git diff --check` pass. The first full typecheck before rebasing failed because `.next` still referenced the leader routes absent from the old base; those routes are present after the rebase, and full typecheck/build now pass. Real Graphify **0.9.100** extraction against the existing fixture snapshot at `63317bd` produced **147 nodes, 330 edges, 27 code files**; the local query returned `persistVerifiedUpdate`, callers and helpers with pinned excerpts. Graph outputs are ignored and not committed. No live meeting import, agent change, provider call, browser visual QA, hardware gesture test or voice-latency measurement was run. Enable `KKB_CODE_GRAPH` for the chosen snapshot and restart; rebuild whenever that snapshot changes.

## 4. Task board

Status: `todo` · `doing (who)` · `done (commit)` · `blocked (why)`. Update in place.

| ID | Task | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| X1 | `npm install && npm run typecheck && npm test && npm run build`; fix breakages without weakening tests | Codex | done (PR #2 review; files and results in §3) | All four green; paste results in §3 |
| U1 | **Pick the ONE approved Wispr meeting** (title/date or link) and confirm the demo repo = this repo | **User** | approved (D-031/D-032; source details private) | Approval and private import recorded |
| U2 | Name 1–3 consenting test participants; they consent on record (no phone numbers in git) | **User** | todo | Consent note per person (who, when, how) |
| W1 | Wispr import: `get_meeting` + paginated transcript for U1 → `data/private/meeting.json` (`source: "LIVE"`, only decision/assignment passages, with char offsets) and `data/private/project.json` (real participants + tasks, ownership state from exact words) | Codex | verified LIVE locally on `codex/live-demo`; no confirmed PR match | `npm run snapshot` prints `LIVE snapshot` |
| G1 | Harden GitHub adapter: pagination, rate-limit errors, unit test with mocked fetch; ensure checks for head SHA appear once CI runs | Codex | done (PR #7 merged at `6a5b2a3`) | 36 tests, typecheck, production build, and live GitHub fixture snapshot pass |
| B1 | Tunnel: `npm run dev` + `cloudflared tunnel --url http://localhost:3000` (or ngrok); record URL in `.env.local` only | Codex / user machine | production server/tunnel running in live-demo worktree; public HTTPS authentication verified | Public unauthenticated POST returned 401. URL stays in ignored local files |
| B2 | **Authorized by user (D-033).** Bolna agent "Kaam Ki Baat" via Bolna MCP: one persona (Hinglish), 4 custom functions → `$URL/api/tools/<name>`, Bearer `KKB_TOOL_KEY`, `call_token` from `user_data`. Write exact config to `docs/bolna/agent.md` (no secrets). Confirm schema with Bolna `search_docs` first | Codex | agent created; 6 functions verified by persisted read-back; live call forwarding pending | All six functions read back; redacted profile committed |
| B3 | **Consent and secure tester numbers required.** First real call (V1): `npm run call:token -- --participant <id> --consent "<who/when>"` → Bolna call with `user_data.call_token` | User + Codex | blocked on U2, B2 | Execution ID, duration >45 s, tool calls in `data/runtime/events.jsonl` |
| E1 | Post-call evaluation: preserve metadata recorder; add private normalized import, immutable/idempotent runs, and deterministic qualification/evidence checks | Codex + evaluation agents | **doing** — `feat/post-call-evaluation`, based on `17de40b`; implementation pending | Synthetic regression checks + private CLI retry/read-back; real-call acceptance pending |
| F1 | V1 failure → **dictate fix requirement with Wispr Flow** → implement → V2 replay of same scenario | Claude + user | todo | V1 vs V2 table in `docs/evals/` |
| UI1 | Polish board: active-card animation, LIVE/FIXTURE badge prominent, timeline of tool calls | Codex | code on `main` via PR #8 (`4d72575`); three-card visual QA not repeated at `f7100a6` | Screenshot in PR |
| S1 | Bolna spatial browser workspace: meeting context on left, code on right, shared page state and validated browser actions; browser controls first, AirPods later | Codex | merged at `f7100a6` (PR #10). Connect form rendered locally; live validation pending B2/B3 | 50/50 tests this session. Optional six-function config supported; no agent changed or call started |
| C1 | Core done: store, auth, specialists, 4 tools, slice test | Claude | **done** (this PR) | 25/25 tests |
| G2 | Optional Graphify code graph → bounded, SHA-pinned code retrieval for meeting/task knowledge transfer | Codex | implemented on `codex/graphify-context`; PR pending, merge remains with user | 91/91 tests, full typecheck/build, real local fixture extraction/retrieval and setup docs; §3d |

| Z1 | Zones backend: roles + step-up, focus/activation gate, Team Memory, tickets → leader resolve → delivery/ack, live utterances, code-location pinning, callback dedupe, `request_clarification` phone tool | Claude | done (`claude/leader-escalation-backend`) | 75/75 tests incl. acceptance flow |
| Z2 | Run `npm ci && npm run typecheck && npm run build` + HTTP smoke for `/api/zones/*` on a machine with registry access | Codex | verified locally on PR #11 review: npm ci, 83/83 tests, full typecheck, build and isolated HTTP smoke pass; merged in PR #11 at `f4b1e71` | Results in §3 |
| Z3 | Replace demo leader one-time code with WebAuthn passkey verifier (`StepUpVerifier` interface in `lib/zones/identity.ts`) | Codex or Claude | todo | Passkey assertion verified server-side |
| Z4 | Webcam provider: MediaPipe Face Landmarker yaw → `lib/focus/selector.ts` → `POST /api/zones/focus`; keyboard/tap fallback | Claude (frontend) | doing (claude) | Head turn selects; tap activates |
| Z5 | Native AirPods companion (Swift, `CMHeadphoneMotionManager`) mirroring `selector.ts` and posting `focus` events | Codex | todo (needs Mac + AirPods) | Device test notes |
| Z6 | Add `request_clarification` (5th tool) to the Bolna agent config; get_task_evidence `focus:"memory"` for Team Memory | Codex | todo (agent change gated) | Config regenerated |
| M12 | Resolve PR #12 against merged PR #11 and the event-log path fix, preserve LIVE setup/call hold, validate and merge | Codex | conflicts resolved on `codex/review-live-demo`; 86 tests, typecheck, build and HTTP smoke pass; updated-head CI/merge pending | Updated head passes unit/integration tests, full typecheck, build and CI; merge read back |

## 5. Change log (newest first; one line each)

- 2026-11-15 · Codex · Integrated incoming PR #14 documentation merge `99d0f78` during M12 review. Preserved its E1 task claim and evaluation checkpoint alongside the verified LIVE setup. No application files changed in this documentation merge; prior 86-test/typecheck/build/HTTP validation remains applicable. Calls remain held.

- 2026-11-15 · Codex · G2 implemented: local Graphify build from selected pinned code, validated graph sidecar, cached bounded retrieval with keyword fallback, directed relationship confidence, phone/device provenance and a developer KT query. Preserved incoming leader/evaluation changes when rebasing onto `99d0f78`; conflicts were additive plan/environment entries only. 91/91 tests, typecheck, production build, local links and whitespace pass. Actual Graphify 0.9.100 fixture extraction/retrieval passed. No approved meeting or provider call was used. Setup and evidence in §3d and `docs/code-context.md`.

- 2026-11-15 · E1 claimed · Codex is extending the existing recorder on `feat/post-call-evaluation` from `17de40b`. This planning checkpoint contains no new evaluator implementation. Parallel agents own evaluator/types, private storage/CLI, and tests; parent owns integration/docs. No real calls or provider changes authorized by this task.

- 2026-11-15 · Codex · M12 integration validated: 86/86 tests, full typecheck, production build, isolated zones HTTP smoke, local documentation links and whitespace pass. Added a regression that retains the leader’s saved answer while asking only for a possible code match on an unlinked task. Main’s zone/backend fixes, blank-path helper/test and stable decision IDs remain intact. No private data imported, provider configuration changed, call started or deployment performed during merge review. Updated-head CI and merge remain pending.

- 2026-11-15 · E1 claimed · Codex is extending the existing recorder on `feat/post-call-evaluation` from `17de40b`. This planning checkpoint contains no new evaluator implementation. Parallel agents own evaluator/types, private storage/CLI, and tests; parent owns integration/docs. No real calls or provider changes authorized by this task.

- 2026-11-15 · Codex · Resumed the authorized PR #11 merge after both checks passed on `7700dad`. Incoming main `016a313` changed the plan and centralized event-log paths. Preserved both sides in an isolated PR-review worktree because the shared root now has active Graphify work; no shared dirty files were switched or overwritten. CodeRabbit’s new comment only reports skipped automatic review, not a code finding. Calls remain held.

- 2026-11-15 · Codex · User explicitly authorized resolving and merging PR #11. Claimed Z2 and conflict/CI review on `codex/review-leader-backend`; fetched current main, inspected PR context, preserved the live-demo/readiness branches, and identified the callback test type errors. Reviewing authorization/source boundaries before merge. Calls remain held for one final specific participant confirmation.

- 2026-11-15 ~15:00 · Claude · `claude/leader-escalation-backend` from `main` `f7100a6` (baseline 50/50 tests, core typecheck clean, demo:dry OK; `npm ci`/build not runnable in sandbox). Added `lib/zones/` (server-owned roles, device sessions, leader step-up, focus/activation gate where head turns only select, Team Memory with approved-only answers + Hinglish self-correction, clarification tickets with idempotency and a state machine, leader resolution with optimistic versioning + read-back + context version, delivery after reconnect, opt-in live-STT ingestion with consent/dedupe/seq/provisional/revocation, SHA-pinned code locations with range verification, Bolna callback dedupe), `lib/focus/selector.ts` (calibration, EMA, dwell, hysteresis, tracking loss, recentre), `EventStore.appendGuarded`, routes `/api/zones/[action]` and `/api/bolna/callback`, scripts `session:issue`/`leader:code`, and a 5th phone tool `request_clarification`. 75/75 tests (all synthetic).

- 2026-11-15 · Codex · Claimed G2 on `codex/graphify-context` from fetched `origin/main` `016a313`. User requested Graphify for codebase knowledge transfer and clarified that “LinkedIn” meant linking context. Existing Code Scout is a keyword scan; no Graphify data or integration exists. Implement an opt-in graph over the configured snapshot files, preserving exact source/SHA and existing task authorization. Other worktrees and the unmerged leader backend stay untouched.

- 2026-11-15 · status recheck · Checkpoint moved to `17de40b` (plan-only commit; stored `origin/main` matches; no fetch). Working tree still has the uncommitted blank `KKB_EVENTS_FILE` fix, generated `next-env.d.ts`, and this note. Ignored `data/runtime/events.jsonl` has one fixture `call_session` for `p_dev` and no task update. The evaluation worktree is clean at `17de40b`. Milestones 2, 3, 5, and 6 remain started; 1 and 4 have not reached their gates. Tests, typecheck, build, HTTP, MCP, live GitHub, and the public tunnel were not rerun.

- 2026-11-15 · local test · A blank `KKB_EVENTS_FILE` in `.env.local` made `POST /api/spatial/browser` return 500 (`EISDIR` while reading the project directory). `eventsLogPath()` now treats a blank setting as `data/runtime/events.jsonl`. 51/51 tests pass. A fixture participant session then loaded meeting passages and switched to the codebase panel. Leader Desk stayed locked. No Bolna call. This fix is not committed.

- 2026-11-15 · Codex · Claimed M12 after explicit user authorization to review, resolve and merge PR #12. Current main includes merged PR #11 at `f4b1e71` and the shared blank-event-log-path helper. Preserving both leader clarification delivery and truthful unlinked-code invitations, both event unions/projections, source provenance and server-side call gates. Main decision IDs 034–037 stay stable; the call hold becomes D-038. Shared dirty Graphify and running live-demo checkouts remain untouched.

- 2026-11-15 · Codex · Coordination checkpoint: preserved parent commits `77d881a`/`d566029` for the dependent readiness lane. Its 57-test/typecheck/build report is separate from this parent's 52 tests. All calls held for ONE final named-participant confirmation (D-038); browser flag disabled. After the readiness check correctly detected a stale selected snapshot, restarted the owned production service. Local and public HTTPS health/authorized board now match repository, SHA, label and fetchedAt; unauthorized evidence/spatial tools return 401; authenticated call start remains 503, with no provider execution or consent receipt. PR #11 subsequently merged at `f4b1e71` after fixes and passing CI; M12 reconciles its runtime/store/decision additions here.

- 2026-11-15 · Codex · Live-demo lane: approved Wispr share resolved and full transcript read; five exact hashed passages retained privately, user-confirmed Speaker 1 mapping, LIVE snapshot with pinned-commit GitHub read and no invented PR link. Created Bolna agent; official v2 update plus persisted MCP read-back verified all six functions after MCP update failed to persist changed task tools. Nine-turn text preview found generic-query false candidates, now fixed with a regression test; unlinked briefs no longer imply exact code exists. Browser minting now requires fresh recording consent, prepares the authorized opening brief, stores consent/execution correlation and stops on consent withdrawal. 52/52 tests, full typecheck and production build passed; LIVE HTTP brief/context/consent preflight passed. No provider session or phone call started. Separate local `codex/live-demo-readiness` lane is preparing preflight/handoff; this lane avoids duplicating that work.

- 2026-11-15 · Codex · Claimed W1/B2 live integration on `codex/live-demo`, based on merged PR #8, then rebased onto merged PR #9/#10 (`f7100a6`). User approved this repository and one shared Wispr note, confirmed Speaker 1 identity, and authorized Bolna agent setup/testing. Source URL and passages stay private. The source describes another product: no PR link is asserted. Actual telephone tests still require participant consent and securely supplied numbers. This lane preserves the merged spatial workspace and optional browser tools.

- 2026-11-15 · conflict resolution · Stash "Taking a full form" (status recheck at `c64d8bc`) conflicted with the spatial status on `main` `f7100a6`. Kept PR #10's implementation evidence and the recheck's distance table. Dropped the superseded "proposal only" and "41/41" claims. `npm test` 50/50 on Node v22.23.2. `npm ci` installed the already-locked `@bolna/web-call` 3.0.1; the dev server needed a restart before health returned the FIXTURE snapshot and unauthenticated tool and spatial posts returned 401. The board rendered the spatial connect form. No meeting imported, agent changed, token connected, or call placed. Typecheck, production build, dry run, live GitHub read, MCP catalogs, and the public tunnel were not rerun. `next-env.d.ts` remains an uncommitted generated rewrite.

- 2026-11-15 · Codex · S1 implements the portfolio's curated context + validated DOM-action pattern with Bolna, not an OpenAI voice runtime. Rebased onto the user's merged PR #8 (`4d72575`) and PR #9 (`c64d8bc`), preserving board/evaluation recovery. Browser controls select left meeting/right code; center is locked pending the proposed leader auth. Two optional HTTP tools read participant-scoped context and relay focus/scroll commands with bounded browser acknowledgement; source excerpts stay SHA-pinned, stale/candidate states remain explicit. Original four runtime tools unchanged. Bolna web SDK 3.0.1 is pinned; its authenticated session route is disabled by default and has not contacted the provider. Nine synthetic tests cover authorization, scoped passages, forbidden actions, DOM read-back, HTTP relay, disconnection/timeout and config. 50/50 tests, full typecheck, production build, local doc links and whitespace pass. Browser visual/mic QA, live Bolna token forwarding/timing, AirPods/camera/leader/live-STT features are not verified or implemented. See `docs/bolna/spatial-browser.md` for transport differences, the mint endpoint documentation discrepancy, and the next authorized call test.

- 2026-11-15 · status recheck · Written against `c64d8bc` before PR #10. GitHub Actions `check` had succeeded on PR #8 and PR #9. Local health had returned the FIXTURE snapshot and an unauthenticated tool POST had returned 401. The distance table from this note is retained in §3a. Its "spatial v2 remains a proposal" and "41/41" statements are not the current status.

- 2026-11-15 · Codex · Recovered PR #6 evaluation recorder/tests and board polish onto `6a5b2a3` without replacing newer GitHub/save fixes. Added a development-only four-function Bolna configuration generator with private output, two configuration tests, a fixture-only HTTP smoke runner, voice setup/runbook, and corrected stale README/evaluation status. 41/41 tests and full typecheck pass; production build passed after recovery. Eleven actual local HTTP checks passed against clearly labelled FIXTURE data; public HTTPS callback rejects requests without credentials (401). Server keys, temporary URL and generated provider configuration stay in ignored local files. Missing evaluation audit evidence is reported as unavailable rather than zero failures/acknowledgments, covered by a regression test. No meeting imported, agent changed or phone call placed. User questions for meeting selection and agent/call authorization remain pending.

- 2026-11-15 · Codex · Claimed recovery/demo-readiness on `codex/demo-readiness` from `origin/main` `6a5b2a3`. PR #6 is marked merged but its merge `8199bc0` is not an ancestor of current main; evaluation recorder and board polish are absent. Recover those selected files only, preserve PR #7 adapter and PR #5 write fixes, then validate and prepare the callback/configuration path. Live meeting selection, agent-change permission and call consent remain pending user input.

- 2026-11-15 · Codex · G1 claimed and implemented in an isolated worktree on `codex/github-adapter-hardening`, initially based on merged PR #2 (`457a6a0`), then rebased onto merged PR #5 (`e005380`). GitHub adapter follows same-resource pagination, rejects incomplete PR files and failed later pages, preserves actual check SHAs, bounds request time, and reports primary/secondary rate limits without echoing provider bodies. Five new regression tests. Bolna and Wispr reconnected in Codex; live catalogs returned 121 and 16 tools respectively, and Bolna account read passed. No meeting imported, agent changed, call placed, or deployment performed. Next: approved meeting selection → W1, then B1/B2 with the existing agent/call authorization gates.

- 2026-11-15 · Codex · User authorized PR #2 review and merge to `main`. No current merge conflicts: head `8767273` already contains `main` (`a6f6a14`). Reproduced and fixed three defects: concurrent retries wrote duplicate updates; cached file reads hid sessions created by the call-token script; mentioned/proposed/missing ownership permitted status writes. `lib/store/event-store.ts` now serializes lookup + append and reads persisted events afresh; `lib/tools/runtime.ts` requires an accepted owner matching the caller. Three new regression tests fail before the fixes and pass after (31/31). Install, full typecheck, production build, fixture demo, local documentation links, and whitespace checks pass. Added dependency lockfile and deterministic CI install. Storage still requires a single runtime writer; cross-process transactional updates and live Wispr/Bolna validation remain unverified. The user merged PR #2 at `457a6a0` while these review fixes were still local; the fixes are being delivered separately to `main`, without another merge authorization.

- 2026-11-15 ~14:20 · Claude · `npm run demo:dry` against the real PR #2 snapshot found 4 defects, now fixed with regression tests: (1) interruption recovery repeated already-spoken facts; (2) Fix Navigator pointed at a test helper, not the regression test; (3) GitHub `skipped` checks (CodeRabbit) were mapped to `failure`; (4) the spoken line number was one line early. 28/28 tests pass. These were found BEFORE any call, so they are not the V1 call failure for F1.

- 2026-11-15 ~14:05 · Claude · Merged `main` into PR #2 branch (took main's docs). Replaced zod/vitest with dependency-free core + `tsx --test` (D-024). Added EventStore, call tokens, 3 specialists + orchestrator, 4 tools, board API/UI, snapshot builder, GitHub adapter, CI. Folded `OPUS_START.md` + `IMPLEMENTATION_STATUS.md` into this file.

## 6. Commands

```bash
npm install
npm test                       # domain + slice tests
npm run typecheck              # core + Next
npm run snapshot:fixture       # FIXTURE snapshot from real repo + synthetic meeting
npm run snapshot               # LIVE snapshot (needs data/private/project.json + meeting.json)
KKB_TOOL_KEY=… KKB_BOARD_KEY=… npm run dev
npm run call:token -- --participant p_dev --consent "verbal, to Harsh, 14:20 IST"
curl -s -X POST localhost:3000/api/tools/get_my_brief -H "Authorization: Bearer $KKB_TOOL_KEY" -H 'content-type: application/json' -d '{"call_token":"…"}'
```

## 7. Never

Commit secrets, phone numbers, or private transcripts · call anyone without recorded consent · call a FIXTURE result "live" · say "saved" without read-back · say "done" from an open PR or a stale check · merge or deploy without the user.
