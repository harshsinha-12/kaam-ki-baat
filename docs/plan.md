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
| `main` | Reviewed work only | User |
| `feat/evidence-core-spatial-specialists` (**PR #2**) | Merged into `main` at `457a6a0` by the user on 2026-11-15. | User |
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

## 3. Current status — last verified 2026-11-15 (Codex, spatial browser branch on merged PRs #8/#9)

| Thing | State | Evidence |
| --- | --- | --- |
| Domain core + 4 runtime tools + 3 specialists | **Implemented** | `lib/**`, commit on PR #2 |
| Unit + vertical-slice tests | **50/50 pass** (`tsx --test`, Node 20.20.0 locally) | Prior 41 tests plus 9 spatial context, action/receipt, DOM executor, configuration and HTTP authentication tests |
| Core typecheck (`tsconfig.core.json`) | **Pass** | local `npm run typecheck`, TypeScript 5.9 |
| Install, full typecheck, production build locally | **Pass**: `npm install`, `npm ci`, `npm run typecheck`, `npm run build` | Node 20.20.0; `package-lock.json` pins dependencies; Next.js 15.5.29 |
| CI workflow | **Passed** on PR #5 head `b63f4a8`; user merged it at `e005380`. PR #7 and main `6a5b2a3` CI passed; recovery PR CI pending | CI now uses `npm ci`, full typecheck, tests, Next build |
| GitHub adapter (live) | **Verified live read** on G1 branch: PR #2 merged, with head and merge-SHA checks | Fixture snapshot at `3795e28`: 28 files, 1 PR, 3 checks; meeting remains synthetic |
| Demo dry run (real tool handlers, no Bolna) | Works; output reviewed | `npm run demo:dry` — NOT call evidence |
| Developer MCP connections | **Reconnected and catalogs verified live**: Bolna 121 tools; Wispr 16 tools | Codex configuration + remote MCP initialize/tools-list; Bolna account read passed. See [integrations.md](integrations.md) |
| Wispr: approved meeting read end-to-end | **BLOCKED — needs user to pick the meeting** | — |
| HTTP callback path | **Verified with FIXTURE data**: 11 local HTTP checks passed; public HTTPS unauthenticated POST returned 401 | Auth, brief, evidence, save/read-back, replay, ownership refusal, changes and board; NOT telephone evidence |
| Bolna agent wired to our endpoints | **Prepared, not created** — four-function private config generated; provider context forwarding unverified | [voice setup](bolna/agent.md); awaits explicit agent-change authorization |
| Evaluation recorder + board polish | **Recovered and implemented** from PR #6 without replacing PR #7 adapter | `lib/eval/recorder.ts`, `scripts/eval-call.ts`, `app/page.tsx`; real-call evaluation pending |
| Real calls >45 s (need 3) | **0** | — |
| **Spatial zones backend** (LEFT Team Memory · CENTER Leader Desk · RIGHT Code Navigator), leader escalation, live-STT lane, FocusInput, Bolna callback dedupe | **Implemented on `claude/leader-escalation-backend`; 75/75 tests (synthetic)** | `lib/zones/**`, `lib/focus/selector.ts`, `app/api/zones/[action]`, `app/api/bolna/callback`; HTTP routes not yet exercised against a running server (Claude sandbox has no registry for `npm ci`). Leader step-up is a server one-time code, NOT a passkey |
| Spatial browser workspace + Bolna relay | **Implemented; synthetic local checks pass** | `app/components/SpatialWorkspace.tsx`, `app/api/spatial/**`, `lib/spatial/**`; [setup and limits](bolna/spatial-browser.md). No browser visual/mic QA or provider call tested; Leader Desk locked, AirPods deferred |

## 4. Task board

Status: `todo` · `doing (who)` · `done (commit)` · `blocked (why)`. Update in place.

| ID | Task | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| X1 | `npm install && npm run typecheck && npm test && npm run build`; fix breakages without weakening tests | Codex | done (PR #2 review; files and results in §3) | All four green; paste results in §3 |
| U1 | **Pick the ONE approved Wispr meeting** (title/date or link) and confirm the demo repo = this repo | **User** | blocked (needs user) | Meeting ID recorded in decisions.md D-021 |
| U2 | Name 1–3 consenting test participants; they consent on record (no phone numbers in git) | **User** | todo | Consent note per person (who, when, how) |
| W1 | Wispr import: `get_meeting` + paginated transcript for U1 → `data/private/meeting.json` (`source: "LIVE"`, only decision/assignment passages, with char offsets) and `data/private/project.json` (real participants + tasks, ownership state from exact words) | Claude (has Wispr MCP) | blocked on U1 | `npm run snapshot` prints `LIVE snapshot` |
| G1 | Harden GitHub adapter: pagination, rate-limit errors, unit test with mocked fetch; ensure checks for head SHA appear once CI runs | Codex | done (PR #7 merged at `6a5b2a3`) | 36 tests, typecheck, production build, and live GitHub fixture snapshot pass |
| B1 | Tunnel: `npm run dev` + `cloudflared tunnel --url http://localhost:3000` (or ngrok); record URL in `.env.local` only | Codex / user machine | verified locally (temporary server/tunnel running) | `curl -X POST $URL/api/tools/get_my_brief` returns 401 without key |
| B2 | **Needs user go-ahead (AGENTS.md gate).** Bolna agent "Kaam Ki Baat" via Bolna MCP: one persona (Hinglish), 4 custom functions → `$URL/api/tools/<name>`, Bearer `KKB_TOOL_KEY`, `call_token` from `user_data`. Write exact config to `docs/bolna/agent.md` (no secrets). Confirm schema with Bolna `search_docs` first | Codex | todo | `get_agent` shows 4 functions; config committed |
| B3 | **Needs user go-ahead (AGENTS.md gate).** First real call (V1): `npm run call:token -- --participant <id> --consent "<who/when>"` → Bolna call with `user_data.call_token` | User + Codex | blocked on U2, B2 | Execution ID, duration >45 s, tool calls in `data/runtime/events.jsonl` |
| E1 | Evaluation recorder: pull Bolna `get_execution` → `docs/evals/<callId>.md` (ID, agent version, duration, tool results, what was communicated, failures) | Codex | implemented on `codex/demo-readiness`; real-call acceptance pending | 1 eval file per real call |
| F1 | V1 failure → **dictate fix requirement with Wispr Flow** → implement → V2 replay of same scenario | Claude + user | todo | V1 vs V2 table in `docs/evals/` |
| UI1 | Polish board: active-card animation, LIVE/FIXTURE badge prominent, timeline of tool calls | Codex | implemented on `codex/demo-readiness`; prior synthetic visual QA retained in PR #6 | Screenshot in PR |
| S1 | Bolna spatial browser workspace: meeting context on left, code on right, shared page state and validated browser actions; browser controls first, AirPods later | Codex | implemented on `codex/spatial-website-agent` (2026-11-15); live validation pending B2/B3 | 50 tests, full typecheck, production build, docs links and whitespace pass. Optional six-function config supported; no agent changed or call started |
| C1 | Core done: store, auth, specialists, 4 tools, slice test | Claude | **done** (PR #2) | 25/25 tests |
| Z1 | Zones backend: roles + step-up, focus/activation gate, Team Memory, tickets → leader resolve → delivery/ack, live utterances, code-location pinning, callback dedupe, `request_clarification` phone tool | Claude | done (`claude/leader-escalation-backend`) | 75/75 tests incl. acceptance flow |
| Z2 | Run `npm ci && npm run typecheck && npm run build` + HTTP smoke for `/api/zones/*` on a machine with registry access | Codex | todo | Results in §3 |
| Z3 | Replace demo leader one-time code with WebAuthn passkey verifier (`StepUpVerifier` interface in `lib/zones/identity.ts`) | Codex or Claude | todo | Passkey assertion verified server-side |
| Z4 | Webcam provider: MediaPipe Face Landmarker yaw → `lib/focus/selector.ts` → `POST /api/zones/focus`; keyboard/tap fallback | Claude (frontend) | doing (claude) | Head turn selects; tap activates |
| Z5 | Native AirPods companion (Swift, `CMHeadphoneMotionManager`) mirroring `selector.ts` and posting `focus` events | Codex | todo (needs Mac + AirPods) | Device test notes |
| Z6 | Add `request_clarification` (5th tool) to the Bolna agent config; get_task_evidence `focus:"memory"` for Team Memory | Codex | todo (agent change gated) | Config regenerated |
| L1 | Landing page (story-driven, motion) | Claude | doing (claude) | Page renders, reduced-motion respected |

## 5. Change log (newest first; one line each)

- 2026-11-15 ~15:00 · Claude · `claude/leader-escalation-backend` from `main` `f7100a6` (baseline 50/50 tests, core typecheck clean, demo:dry OK; `npm ci`/build not runnable in sandbox). Added `lib/zones/` (server-owned roles, device sessions, leader step-up, focus/activation gate where head turns only select, Team Memory with approved-only answers + Hinglish self-correction, clarification tickets with idempotency and a state machine, leader resolution with optimistic versioning + read-back + context version, delivery after reconnect, opt-in live-STT ingestion with consent/dedupe/seq/provisional/revocation, SHA-pinned code locations with range verification, Bolna callback dedupe), `lib/focus/selector.ts` (calibration, EMA, dwell, hysteresis, tracking loss, recentre), `EventStore.appendGuarded`, routes `/api/zones/[action]` and `/api/bolna/callback`, scripts `session:issue`/`leader:code`, and a 5th phone tool `request_clarification`. 75/75 tests (all synthetic).

- 2026-11-15 · Codex · S1 implements the portfolio's curated context + validated DOM-action pattern with Bolna, not an OpenAI voice runtime. Rebased onto the user's merged PR #8 (`4d72575`) and PR #9 (`c64d8bc`), preserving board/evaluation recovery. Browser controls select left meeting/right code; center is locked pending the proposed leader auth. Two optional HTTP tools read participant-scoped context and relay focus/scroll commands with bounded browser acknowledgement; source excerpts stay SHA-pinned, stale/candidate states remain explicit. Original four runtime tools unchanged. Bolna web SDK 3.0.1 is pinned; its authenticated session route is disabled by default and has not contacted the provider. Nine synthetic tests cover authorization, scoped passages, forbidden actions, DOM read-back, HTTP relay, disconnection/timeout and config. 50/50 tests, full typecheck, production build, local doc links and whitespace pass. Browser visual/mic QA, live Bolna token forwarding/timing, AirPods/camera/leader/live-STT features are not verified or implemented. See `docs/bolna/spatial-browser.md` for transport differences, the mint endpoint documentation discrepancy, and the next authorized call test.

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
