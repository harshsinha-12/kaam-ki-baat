# Decision log

Every decision the project depends on, in plain words. Add new entries at the bottom. Never edit an old entry's reason. If a decision changes, add a new entry that says it replaces the old one.

**Status key**
- **Confirmed by user**: the user said so in a message.
- **Proposed**: a design choice recorded for review. It becomes confirmed when the user says so.
- **Open**: nobody has decided yet.

| ID | Date | Decision | Status | Why (simple words) |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-15 | The project is called **Kaam Ki Baat** everywhere. | Confirmed by user | It matches the repository name. The older working titles are no longer used. |
| D-002 | 2026-11-15 | Work happens on separate branches, with a pull request for each change. Pushes do not need to be approved one by one. | Confirmed by user | Several agents work in parallel. Branches and PRs stop them from overwriting each other. |
| D-003 | 2026-11-15 | Merging is done by the user. | Confirmed by user | The user keeps final control over what reaches `main`. |
| D-004 | 2026-11-15 | Claude Opus carries the first application implementation. Codex works on its own branch in parallel. | Confirmed by user | Two agents on separate branches move faster without colliding. |
| D-005 | 2026-11-15 | Every decision and step is written down in plain language. | Confirmed by user | Any agent or teammate must be able to pick up the work from the repository alone. |
| D-006 | 2026-11-15 | Application implementation is authorized to begin, starting with the architecture in this change. Real calls, agent changes, deployment, and merging stay separately gated. | Confirmed by user | The user asked for the first implementation to start. Those other actions still need a fresh instruction. |
| D-007 | 2026-11-15 | Meeting facts come from Wispr Notetaker through the Wispr MCP, read-only. Only approved meetings are imported. | Confirmed by user | Wispr's own access is account-wide, so our app has to choose what is used. |
| D-008 | 2026-11-15 | Bolna runs the phone call. Bolna never holds our data and never decides identity. | Proposed | Keeps identity and permission checks on our server, where they can be tested. |
| D-009 | 2026-11-15 | Caller identity comes from a server-side call record and a single-use token. A phone number alone is never identity. | Proposed | Stops a model, or a wrong number, from reaching someone else's private evidence. |
| D-010 | 2026-11-15 | Status is set by fixed rules in code. A language model may suggest a match but never confirms it. | Proposed | The same evidence should always give the same status, and this can be tested. |
| D-011 | 2026-11-15 | The store is append-only. Old values stay visible with their provenance. | Proposed | A teammate can ask what changed and why. |
| D-012 | 2026-11-15 | A save is spoken only after read-back. A timeout counts as a failure. | Proposed | Stops the agent from claiming a change that never happened. |
| D-013 | 2026-11-15 | Four runtime tools only: brief, evidence, changes, and verified update. | Proposed | A small surface is easier to secure and test. |
| D-014 | 2026-11-15 | A call counts only if its duration is strictly greater than 45 seconds and consent is recorded. | Confirmed by user | This is the competition rule (see competition.md). |
| D-015 | 2026-11-15 | Every call is evaluated and stored, and reviewed fixes are tracked by agent version. | Confirmed by user | The user asked for evidence of improvement between calls. |
| D-016 | 2026-11-15 | One Next.js + TypeScript service, with provider adapters kept separate. | Proposed | Simplest structure that fits the time limit. Taken from the original handoff. |
| D-017 | 2026-11-15 | No vector database, no embeddings, no repository-wide indexing for the MVP. | Proposed | Not needed for one meeting and one repository. Adds risk and time. |
| D-018 | 2026-11-15 | Bolna integration pattern A (custom functions) for actions and saves. | Proposed | Each action is explicit and logged. Pattern B is reviewed later. |
| D-019 | 2026-11-15 | Bolna integration pattern B (custom language model) for conversation turns. | Open | Needs Bolna's current documentation confirmed before choosing. |
| D-020 | 2026-11-15 | Which storage and hosting setup for the first slice (for example, SQLite with a tunnel, or Postgres). | Open | Depends on where the HTTPS endpoints will run. |
| D-021 | 2026-11-15 | Which meeting and repository are approved for the demo. | Open | Must come from the user. No meeting or repository is assumed. |
| D-022 | 2026-11-15 | Which participants agree to take part in calls and how they verify. | Open | Consent and verification rules are needed before any real call. |
| D-023 | 2026-11-15 | Which voices and speech settings are used for Hindi, English, and Hinglish. | Open | To be chosen from measured results, not from documentation. |
| D-024 | 2026-11-15 | The domain core (`lib/`) has no runtime dependencies. Tests use Node's built-in runner through `tsx --test`. This replaces zod and vitest from the first scaffold. | Proposed | It runs anywhere with one dev tool, including sandboxes without package access, and leaves less to install during a three-hour build. Input checks live in `lib/validate.ts`. |
| D-025 | 2026-11-15 | First-slice storage is an append-only JSONL event log (`data/runtime/events.jsonl`), written with fsync and read back after each write. It runs on the local Next.js server, exposed through a tunnel. Answers D-020 for the demo. | Proposed | No database to set up. It is auditable line by line and survives restarts. A serverless deployment would lose the file, so deployment waits for approval. |
| D-026 | 2026-11-15 | Bolna uses pattern A. Four custom functions are POSTed to `/api/tools/<name>` with a Bearer server key, and a per-call `call_token` comes from `user_data`. Confirms D-018 for the demo. | Proposed | Each fact and each write is an explicit, logged call. Identity comes from the token, never from the model. |
| D-027 | 2026-11-15 | Wispr import is a development-time MCP read by an agent, for one approved meeting only. It writes to the gitignored `data/private/meeting.json`. The server never holds Wispr OAuth. | Proposed | Wispr OAuth is account-wide and lives in the agent client. Keeping it there avoids building an MCP client into the server during the hackathon. The snapshot is labeled LIVE only when both the meeting read and the GitHub read were live. |
| D-028 | 2026-11-15 | PR #2's branch is the integration branch. Claude works on `claude/*` branches and Codex on `codex/*` branches, each opening PRs into it, with file ownership as in plan.md §1. | Proposed | Parallel agents don't collide, and the integration branch always holds the working slice. |
