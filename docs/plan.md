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
| `main` | Reviewed work only. Tip `f7100a6` matches `origin/main` after fetch on 2026-11-15. | User |
| `feat/evidence-core-spatial-specialists` (**PR #2**) | Merged into `main` at `457a6a0` by the user on 2026-11-15. | User |
| `codex/demo-readiness` (**PR #8**) | Merged into `main` at `4d72575` on 2026-11-15. | User |
| `docs/spatial-live-context-v2` (**PR #9**) | Merged into `main` at `c64d8bc` on 2026-11-15. Documentation only. | User |
| `codex/spatial-website-agent` (**PR #10**) | Merged into `main` at `f7100a6` on 2026-11-15. | User |
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

- **Code Scout** — keyword scan of snapshot files at the pinned SHA. `confirmed` only if the file is changed in the task's PR; otherwise `candidate`.
- **Fix Navigator** — target file + enclosing function + line + nearest test + `npm test -- <file>`; GitHub permalinks pinned to SHA. Never edits code.
- **Evidence Verifier** — `lib/core/reconcile.ts` (deterministic): ownership state, PR open/merged, checks on the *current* SHA vs stale, last saved update. Never says "works in production".

## 3. Current status — last verified 2026-11-15 (conflict resolved on `main` `f7100a6`)

Checkpoint: `f7100a62b4851a77191b9fe297d5b86ad2ca3b2e` (Merge pull request #10, 2026-11-15 14:23 IST). After `git fetch`, `main` matches `origin/main`. GitHub Actions `check` succeeded on PR #10; CodeRabbit was `SKIPPED`.

The conflict was a status recheck stashed at `c64d8bc` ("Taking a full form") against the spatial-browser status already on `main`. Resolution follows the earlier recovery rule: keep the newer merged evidence, and keep the older notes that are still true. That recheck's "spatial v2 is only a proposal" and "41/41 tests" statements were true before PR #10 and are not the current status. Its distance table stays, updated to this commit. [Spatial live context v2](spatial-live-context-v2.md) remains the larger proposal. The browser slice on `main` is the implemented part: meeting on the left, code on the right, Leader Desk locked. Camera, passkey, and live-speech code are still absent.

`npm test` this session: **50/50 pass** (`tsx --test`, Node v22.23.2, 2038 ms). `npm ci` installed 35 packages, including `@bolna/web-call` 3.0.1, which `package-lock.json` already pinned. A dev server started before that install returned 500 (`Can't resolve '@bolna/web-call'`). After `npm ci` and a restart, `GET /api/health` returned 200 with snapshot label `FIXTURE` and pinned SHA `63317bd`. Unauthenticated `POST /api/tools/get_my_brief` and `POST /api/spatial/tools/get_page_context` returned 401. The board page returned 200, showed the spatial connect form, and said it is waiting for a call. No participant token was connected.

`next-env.d.ts` still has an uncommitted Next.js generated route reference and is not in this commit. `/Users/harshsinha/kaam-ki-baat-evaluation` is a clean `feat/post-call-evaluation` worktree at the same `f7100a6`. There is no `data/private/`, `data/runtime/`, or `docs/evals/`.

| Thing | State | Evidence |
| --- | --- | --- |
| Domain core + 4 runtime tools + 3 specialists | **Implemented** | `lib/**`, `app/api/tools/[tool]/route.ts`, `app/api/board/route.ts`, `app/api/health/route.ts`; still present at `f7100a6` |
| Unit + vertical-slice tests | **50/50 pass** this session (`tsx --test`, Node v22.23.2) | 10 files in `tests/`. The spatial PR recorded the same 50/50 count on Node 20.20.0 |
| Core typecheck, install, production build | **Pass recorded** on the spatial PR (Node 20.20.0, Next.js 15.5.29, TypeScript 5.9) | This session ran `npm ci` and `npm test` only. `npm run typecheck` and `npm run build` were not rerun |
| CI workflow | **Passed** on PR #10 (`f7100a6`): GitHub Actions `check` `SUCCESS`; CodeRabbit `SKIPPED` | `gh pr view 10` on 2026-11-15. PR #8 and PR #9 checks had already succeeded |
| Database | **None** | Append-only JSONL in code. `data/private/` and `data/runtime/` are absent, so there is no `events.jsonl` |
| GitHub adapter (live) | **Code merged** in PR #7 at `6a5b2a3`. Earlier live read was on the G1 branch | This session did not repeat the live GitHub read. Fixture meeting remains synthetic. Fixture snapshot at `3795e28`: 28 files, 1 PR, 3 checks |
| Demo dry run (real tool handlers, no Bolna) | Recorded earlier | `npm run demo:dry` was not rerun. It is not call evidence |
| Developer MCP connections | **Earlier live catalogs**: Bolna 121 tools; Wispr 16 tools | Not rechecked this session. See [integrations.md](integrations.md) |
| Wispr: approved meeting read end-to-end | **BLOCKED — needs user to pick the meeting** | No imported meeting |
| HTTP callback path | **Local server is up on FIXTURE data** | Restarted `next dev` (Next.js 15.5.29) on port 3000 after installing `@bolna/web-call`. Health 200. Unauthenticated tool and spatial posts 401. Public tunnel URL was not called. Earlier 11-check FIXTURE smoke was not rerun |
| Bolna agent wired to our endpoints | **Prepared, not created** | [voice setup](bolna/agent.md) and [browser setup](bolna/spatial-browser.md). No agent id. Awaits explicit agent-change authorization |
| Evaluation recorder + board page | **On `main` via PR #8** | `lib/eval/recorder.ts`, `scripts/eval-call.ts`, `app/page.tsx`. `docs/evals/` does not exist |
| Spatial browser workspace + Bolna relay | **On `main` via PR #10. Synthetic tests pass. The connect form rendered** | `app/components/SpatialWorkspace.tsx`, `app/api/spatial/**`, `lib/spatial/**`. Leader Desk locked. No connected workspace, microphone, or provider call. AirPods deferred |
| Real calls >45 s (need 3) | **0** | No execution record and no placed call |

## 3a. Distance to the final product

Checked against `f7100a6` on 2026-11-15. Milestones 2, 3, 5, and 6 have code on `main`. Milestones 1 and 4 have not reached their product gates. The spatial workspace is part of the board surface. It is not a telephone call. MCP catalogs and the local FIXTURE server are not a telephone runtime.

| Product step | Where it is specified | What the checkout shows |
| --- | --- | --- |
| 1. Authorized meeting, repository, participants, storage, and callback | Milestone 1 and [context.md](context.md) | Meeting, participants, and consent are still open (U1, U2). No private meeting import. Local health and unauthenticated tool and spatial refusal were observed this session. Public tunnel URL was not rechecked. |
| 2. Smallest service and typed evidence records | Milestone 2 | **Started.** `package.json`, `lib/`, `app/`, and `tests/` exist. Reconciliation and specialists are in code. No database file. |
| 3. One brief and one verified task update | Milestone 3 | **Started in code.** Four tool handlers and the fixture smoke script exist. No saved update from an approved meeting is on disk. |
| 4. Live voice tools on a real call | Milestone 4 and [integrations.md](integrations.md) | **Not started as a call.** Bolna configuration is drafted, including two optional browser tools. No agent has been created and no call has been placed. |
| 5. Stored evaluation and a reviewed fix between calls | Milestone 5 and [evaluation-pipeline.md](evaluation-pipeline.md) | **Recorder started.** Code is merged. No eval file, and no V1/V2 replay. |
| 6. Evidence board and demo record | Milestone 6 | **Board and spatial workspace started** in `app/page.tsx` and `app/components/SpatialWorkspace.tsx`. The connect form rendered locally. No real-call demo record. Deployment was not performed. |

The next product step is milestone 1: the user picks the one approved Wispr meeting. W1 stays blocked until that choice is recorded. Agent creation, a call, deployment, and merging still need their own instruction.

## 3c. PR #11 merge review — 2026-11-15

User explicitly authorized conflict resolution and merge. Codex preserved the incoming main status reconciliation, fixed callback-result typing and decision-ID collisions, and reproduced four failing regressions before fixing them: cross-meeting live remarks, narrowed-call clarification disclosure, missing expected decision versions and idempotency-key collisions. Further review added source-backed decision gating, participant-only passage filtering, one-use/rate-limited leader codes, sharing-withdrawal checks, session-scoped utterance revisions, a single durable decision/ticket resolution event, bounded JSON/method guards and finalizing-to-completed callback handling. Leader codes remain a demo verifier, not WebAuthn. The final review also reproduced and fixed matching ticket retries after the leader had answered: idempotency now runs before current-memory rejection under the write lock, ticket creation is read back, and telephone retries report the saved answer rather than saying the send failed.

`npm ci`, 82/82 synthetic tests, full typecheck, production build and `npm run smoke:zones` pass locally. The HTTP smoke starts its own temporary production server/synthetic store, verifies leader gates and persisted read-back through a fresh store instance, and shuts it down; it does not touch the private live server or contact a provider. Install audit reports existing Next/PostCSS advisories whose suggested fix is a major Next upgrade; no forced framework upgrade was applied during this merge. Live microphone, provider calls, hardware gestures and passkeys remain unverified.

## 4. Task board

Status: `todo` · `doing (who)` · `done (commit)` · `blocked (why)`. Update in place.

| ID | Task | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| X1 | `npm install && npm run typecheck && npm test && npm run build`; fix breakages without weakening tests | Codex | done (PR #2 review; files and results in §3) | All four green; paste results in §3 |
| U1 | **Pick the ONE approved Wispr meeting** (title/date or link) and confirm the demo repo = this repo | **User** | blocked (needs user) | Meeting ID recorded in decisions.md D-021 |
| U2 | Name 1–3 consenting test participants; they consent on record (no phone numbers in git) | **User** | todo | Consent note per person (who, when, how) |
| W1 | Wispr import: `get_meeting` + paginated transcript for U1 → `data/private/meeting.json` (`source: "LIVE"`, only decision/assignment passages, with char offsets) and `data/private/project.json` (real participants + tasks, ownership state from exact words) | Claude (has Wispr MCP) | blocked on U1 | `npm run snapshot` prints `LIVE snapshot` |
| G1 | Harden GitHub adapter: pagination, rate-limit errors, unit test with mocked fetch; ensure checks for head SHA appear once CI runs | Codex | done (PR #7 merged at `6a5b2a3`) | 36 tests, typecheck, production build, and live GitHub fixture snapshot pass |
| B1 | Tunnel: `npm run dev` + `cloudflared tunnel --url http://localhost:3000` (or ngrok); record URL in `.env.local` only | Codex / user machine | local server and cloudflared process observed 2026-11-15; public URL not rechecked | Local unauthenticated POST returned 401. Public URL stays in `.env.local` only |
| B2 | **Needs user go-ahead (AGENTS.md gate).** Bolna agent "Kaam Ki Baat" via Bolna MCP: one persona (Hinglish), 4 custom functions → `$URL/api/tools/<name>`, Bearer `KKB_TOOL_KEY`, `call_token` from `user_data`. Write exact config to `docs/bolna/agent.md` (no secrets). Confirm schema with Bolna `search_docs` first | Codex | todo | `get_agent` shows 4 functions; config committed |
| B3 | **Needs user go-ahead (AGENTS.md gate).** First real call (V1): `npm run call:token -- --participant <id> --consent "<who/when>"` → Bolna call with `user_data.call_token` | User + Codex | blocked on U2, B2 | Execution ID, duration >45 s, tool calls in `data/runtime/events.jsonl` |
| E1 | Evaluation recorder: pull Bolna `get_execution` → `docs/evals/<callId>.md` (ID, agent version, duration, tool results, what was communicated, failures) | Codex | code on `main` via PR #8 (`4d72575`); real-call acceptance pending | 1 eval file per real call |
| F1 | V1 failure → **dictate fix requirement with Wispr Flow** → implement → V2 replay of same scenario | Claude + user | todo | V1 vs V2 table in `docs/evals/` |
| UI1 | Polish board: active-card animation, LIVE/FIXTURE badge prominent, timeline of tool calls | Codex | code on `main` via PR #8 (`4d72575`); three-card visual QA not repeated at `f7100a6` | Screenshot in PR |
| S1 | Bolna spatial browser workspace: meeting context on left, code on right, shared page state and validated browser actions; browser controls first, AirPods later | Codex | merged at `f7100a6` (PR #10). Connect form rendered locally; live validation pending B2/B3 | 50/50 tests this session. Optional six-function config supported; no agent changed or call started |
| C1 | Core done: store, auth, specialists, 4 tools, slice test | Claude | **done** (this PR) | 25/25 tests |

| Z1 | Zones backend: roles + step-up, focus/activation gate, Team Memory, tickets → leader resolve → delivery/ack, live utterances, code-location pinning, callback dedupe, `request_clarification` phone tool | Claude | done (`claude/leader-escalation-backend`) | 75/75 tests incl. acceptance flow |
| Z2 | Run `npm ci && npm run typecheck && npm run build` + HTTP smoke for `/api/zones/*` on a machine with registry access | Codex | verified locally on PR #11 review: npm ci, 82/82 tests, full typecheck, production build and isolated HTTP smoke pass; CI/merge pending | Results in §3 |
| Z3 | Replace demo leader one-time code with WebAuthn passkey verifier (`StepUpVerifier` interface in `lib/zones/identity.ts`) | Codex or Claude | todo | Passkey assertion verified server-side |
| Z4 | Webcam provider: MediaPipe Face Landmarker yaw → `lib/focus/selector.ts` → `POST /api/zones/focus`; keyboard/tap fallback | Claude (frontend) | doing (claude) | Head turn selects; tap activates |
| Z5 | Native AirPods companion (Swift, `CMHeadphoneMotionManager`) mirroring `selector.ts` and posting `focus` events | Codex | todo (needs Mac + AirPods) | Device test notes |
| Z6 | Add `request_clarification` (5th tool) to the Bolna agent config; get_task_evidence `focus:"memory"` for Team Memory | Codex | todo (agent change gated) | Config regenerated |

## 5. Change log (newest first; one line each)

- 2026-11-15 · Codex · User explicitly authorized resolving and merging PR #11. Claimed Z2 and conflict/CI review on `codex/review-leader-backend`; fetched current main, inspected PR context, preserved the live-demo/readiness branches, and identified the callback test type errors. Reviewing authorization/source boundaries before merge. Calls remain held for one final specific participant confirmation.

- 2026-11-15 ~15:00 · Claude · `claude/leader-escalation-backend` from `main` `f7100a6` (baseline 50/50 tests, core typecheck clean, demo:dry OK; `npm ci`/build not runnable in sandbox). Added `lib/zones/` (server-owned roles, device sessions, leader step-up, focus/activation gate where head turns only select, Team Memory with approved-only answers + Hinglish self-correction, clarification tickets with idempotency and a state machine, leader resolution with optimistic versioning + read-back + context version, delivery after reconnect, opt-in live-STT ingestion with consent/dedupe/seq/provisional/revocation, SHA-pinned code locations with range verification, Bolna callback dedupe), `lib/focus/selector.ts` (calibration, EMA, dwell, hysteresis, tracking loss, recentre), `EventStore.appendGuarded`, routes `/api/zones/[action]` and `/api/bolna/callback`, scripts `session:issue`/`leader:code`, and a 5th phone tool `request_clarification`. 75/75 tests (all synthetic).

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
