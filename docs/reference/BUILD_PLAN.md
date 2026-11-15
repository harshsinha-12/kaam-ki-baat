> Planning reference adapted from the user-supplied handoff on 2026-11-15. Project naming has been updated. This is design intent, not implemented behavior. Current user instructions and [the active plan](../plan.md) take precedence.

# Three-hour offline build plan — three teammates

## Definition of success
One selected consented meeting -> one selected authorized repo -> one user-specific evidence-backed Bolna briefing -> one verified persisted update -> three real consenting calls >45s -> one genuine failure + passing regression after Wispr-dictated improvement.

## Assign ownership
- **Teammate A — Wispr + evidence:** Notetaker/MCP OAuth (test first), consented source extraction and `meeting_span` provenance; Flow voice-only test authoring.
- **Teammate B — GitHub + data:** repo read adapter, PR/file/check state, SHA-pinned evidence, deterministic reconciliation, storage.
- **Teammate C — Bolna + demo:** real calls, custom tools, call logs and UX evidence board; coordinate qualifying testers.

## Time-boxes
| Clock | Activity | Go/no-go gate |
|---|---|---|
| 0:00–0:20 | A proves MCP read; C proves real Bolna phone call; B proves repo read | 2 external gates plus repo data accessible |
| 0:20–0:50 | Work-item/evidence fixtures, structured data and one HTTP API | One task can be shown with evidence |
| 0:50–1:20 | Connect Bolna functions; one personalized real call | A verified answer & persisted action |
| 1:20–2:15 | Three >45s consenting calls; inspect transcripts and backend writes | Capture real failures and durations |
| 2:15–2:40 | Dictate bug description with Wispr; implement one focused fix; replay | Comparable V1/V2 test evidence |
| 2:40–3:00 | One-page demo, call recordings, caveats and submission | No unsupported claims |

## Explicit cuts
No vector DB, no full-repo embeddings, no autonomous code writing, no OAuth to third-party meeting accounts unless already permitted, no background call scheduling, no separate microservices, no generic task manager, no team-wide call blasts.

## Gates and fallback
- Wispr MCP blocked: explicitly approved transcript snapshot only (label fallback). Do not claim the MCP integration works.
- GitHub private repo access blocked: use authorized PUBLIC repository with real read-only citations or synthetic fixture clearly marked. Do not scrape secrets.
- Bolna tool callback fails: prioritize working real calls, fix HTTPS/auth/idempotency; never fake writes.
- Any feature not operating by 2:15 should not block the three required calls and final evidence.
