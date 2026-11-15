# Spatial specialists (inspired by Air Agents)

Reference: https://github.com/ahmedfahim21/Spatial-Agents. Air Agents places each agent at an azimuth around the listener. Each agent shows a status (idle, working, needs approval, has a reply) and keeps its own session. The listener turns toward an agent to pick it.

Kaam Ki Baat borrows the **placement, status and persistent context**, not the audio. One Bolna voice persona delegates to three backend specialists (`lib/specialists/`):

| Position | Specialist | Job | Code |
| --- | --- | --- | --- |
| left | Code Scout | Find code, PRs and history at the pinned SHA; candidate vs confirmed | `code-scout.ts` |
| center | Fix Navigator | File, function, line, nearest test, next steps; read-only | `fix-navigator.ts` |
| right | Evidence Verifier | Merged or open, checks on the current SHA or stale, saved or not | `evidence-verifier.ts` |

`orchestrator.ts` keeps `taskId` and `contextVersion` across switches. The version only increases when persisted state changes. "Needs approval" maps to our confirm-before-write rule. A phone call is mono: the left/center/right placement is a UI metaphor, not spatial audio.
