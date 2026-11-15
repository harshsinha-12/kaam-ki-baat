# Kaam Ki Baat — BUILD PLAN (single source of truth)

**Every agent (Claude, Codex) and every human reads this first and updates it after each meaningful change.**
Rules live in [AGENTS.md](../AGENTS.md). Design lives in [architecture.md](architecture.md). Decisions live in [decisions.md](decisions.md). This file is *status + who does what next*.

Hackathon build window: **1–4 PM IST, 2026-11-15** ([competition.md](competition.md)).

## 0. Goal of the demo (the vertical slice)

> **One approved Wispr meeting → one codebase finding → one exact code pointer → one personalized Bolna call → one verifiably saved action.**

Demo script (≈90 s, must be >45 s on Bolna's own log):
1. Kaam Ki Baat calls a consenting teammate. `get_my_brief` → *"In <meeting>, the team agreed: X. PR #2 is still open, not merged. Want me to show you where the code is?"*
2. Caller interrupts: *"Ruko — code kahan hai?"* → Fix Navigator: file, function, line, test. Then *"Also, before I forget: …"* (unfinished fact resumes).
3. *"Did CI pass?"* → Evidence Verifier: checks on the **current** SHA, or "that result is for an older commit".
4. *"Mark it in progress."* → confirm → `record_task_update` → *"Saved, and I read it back."*
5. The board at `/?key=…` shows the three cards lighting up left → center → right with SHA-pinned links.

## 1. Branches and lanes

| Branch | Purpose | Who merges |
| --- | --- | --- |
| `main` | Reviewed work only | User |
| `feat/evidence-core-spatial-specialists` (**PR #2**) | **Integration branch.** Lane PRs target this. | User (or lane owner when user says so) |
| `claude/<topic>` | Claude lane work → PR into integration | — |
| `codex/<topic>` | Codex lane work → PR into integration | — |

Before starting: `git fetch && git checkout -b codex/<topic> origin/feat/evidence-core-spatial-specialists`. Rebase on the integration branch before opening a PR. Small PRs, merged often (every 30–40 min).

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

## 3. Current status — last verified 2026-11-15 ~14:20 IST (Claude, sandbox)

| Thing | State | Evidence |
| E1 recorder | Implemented; real-call acceptance blocked | scripts/eval-call.ts fetches execution or reads private get_execution JSON; allowlisted metadata report, exclusive writes, pending duration handling; synthetic privacy tests |
| B1 temporary tunnel | PASS | Public HTTPS POST get_my_brief without key returned 401 unauthorized; URL only in ignored .env.local; dev/tunnel process must remain running |
| G1 adapter | PASS | Pagination + rate-limit + partial failure tests; 31/31 tests, full typecheck; ignored FIXTURE snapshot has successful checks at PR #2 head 8767273 |
| X1 local validation | PASS | 2026-11-15: npm install, npm run typecheck, npm test (28/28), npm run build; Node 25.9.0, Next 15.5.29 |
| --- | --- | --- |
| Domain core + 4 runtime tools + 3 specialists | **Implemented** | `lib/**`, commit on PR #2 |
| Unit + vertical-slice tests | **28/28 pass** (`tsx --test`, Node 22) | run in Claude sandbox |
| Core typecheck (`tsconfig.core.json`) | **Pass** | tsc 6.0 in sandbox |
| Full `npm run typecheck` (Next types) locally | Not run in sandbox (no registry access); CI ran install + build green on `63317bd` | task X1 re-checks locally |
| CI workflow (install, core typecheck, tests, Next build) | **Passed** on `63317bd` (2 runs: `check` success; CodeRabbit skipped) | GitHub check-runs API |
| GitHub adapter (live) | **Works**: read real PR #2 (open, head `63317bd`), changed files, check runs | `npm run snapshot:fixture` → 27 files, 1 PR, 2 checks |
| Demo dry run (real tool handlers, no Bolna) | Works; output reviewed | `npm run demo:dry` — NOT call evidence |
| Wispr: approved meeting read end-to-end | **BLOCKED — needs user to pick the meeting** | — |
| Bolna agent wired to our endpoints | **NOT STARTED** — needs public HTTPS URL (tunnel) | — |
| Real calls >45 s (need 3) | **0** | — |

## 4. Task board

Status: `todo` · `doing (who)` · `done (commit)` · `blocked (why)`. Update in place.

| ID | Task | Owner | Status | Done when |
| --- | --- | --- | --- | --- |
| X1 | `npm install && npm run typecheck && npm test && npm run build`; fix breakages without weakening tests | Codex | done (f3bdebb) | All four green; paste results in §3 |
| U1 | **Pick the ONE approved Wispr meeting** (title/date or link) and confirm the demo repo = this repo | **User** | blocked (needs user) | Meeting ID recorded in decisions.md D-021 |
| U2 | Name 1–3 consenting test participants; they consent on record (no phone numbers in git) | **User** | todo | Consent note per person (who, when, how) |
| W1 | Wispr import: `get_meeting` + paginated transcript for U1 → `data/private/meeting.json` (`source: "LIVE"`, only decision/assignment passages, with char offsets) and `data/private/project.json` (real participants + tasks, ownership state from exact words) | Claude (has Wispr MCP) | blocked on U1 | `npm run snapshot` prints `LIVE snapshot` |
| G1 | Harden GitHub adapter: pagination, rate-limit errors, unit test with mocked fetch; ensure checks for head SHA appear once CI runs | Codex | done (3e686e2) | Test passes; snapshot shows ≥1 check on PR #2 head |
| B1 | Tunnel: `npm run dev` + `cloudflared tunnel --url http://localhost:3000` (or ngrok); record URL in `.env.local` only | Codex / user machine | done (6656310) | `curl -X POST $URL/api/tools/get_my_brief` returns 401 without key |
| B2 | **Needs user go-ahead (AGENTS.md gate).** Bolna agent "Kaam Ki Baat" via Bolna MCP: one persona (Hinglish), 4 custom functions → `$URL/api/tools/<name>`, Bearer `KKB_TOOL_KEY`, `call_token` from `user_data`. Write exact config to `docs/bolna/agent.md` (no secrets). Confirm schema with Bolna `search_docs` first | Codex | todo | `get_agent` shows 4 functions; config committed |
| B3 | **Needs user go-ahead (AGENTS.md gate).** First real call (V1): `npm run call:token -- --participant <id> --consent "<who/when>"` → Bolna call with `user_data.call_token` | User + Codex | blocked on U2, B2 | Execution ID, duration >45 s, tool calls in `data/runtime/events.jsonl` |
| E1 | Evaluation recorder: pull Bolna `get_execution` → `docs/evals/<callId>.md` (ID, agent version, duration, tool results, what was communicated, failures) | Codex | blocked (recorder implemented; real call awaits B2/B3 approval and U2) | 1 eval file per real call |
| F1 | V1 failure → **dictate fix requirement with Wispr Flow** → implement → V2 replay of same scenario | Claude + user | todo | V1 vs V2 table in `docs/evals/` |
| UI1 | Polish board: active-card animation, LIVE/FIXTURE badge prominent, timeline of tool calls | Codex | todo | Screenshot in PR |
| C1 | Core done: store, auth, specialists, 4 tools, slice test | Claude | **done** (this PR) | 25/25 tests |

## 5. Change log (newest first; one line each)

- 2026-11-15 · Codex · E1 recorder implemented: `npx tsx scripts/eval-call.ts --execution <UUID> --call-id <local ID>` (BOLNA_API_KEY via environment), or `--input data/private/execution.json`; report in docs/evals, no raw strings exported. Uses documented GET /executions/{id}; live acceptance blocked until approved calls exist.

- 2026-11-15 · Codex · B1: local Next dev + cloudflared tunnel verified 401 without key; temporary URL recorded only in .env.local. No Bolna operation.

- 2026-11-15 · Codex · G1: paginate files/checks, preserve provider head SHA, report rate limits without response bodies; regression tests and live public check read passed.

- 2026-11-15 · Codex · X1: install, full typecheck, 28 tests and production build passed locally; no source fix needed. Generated package-lock.json left uncommitted outside assigned files.

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
