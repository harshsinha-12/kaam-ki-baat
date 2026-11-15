# Opus starting point

Repo: https://github.com/harshsinha-12/kaam-ki-baat
Feature branch: feat/evidence-core-spatial-specialists

Read AGENTS.md, docs/context.md, docs/instructions.md, docs/plan.md, docs/IMPLEMENTATION_STATUS.md, docs/SPATIAL_SPECIALISTS.md, docs/reference/DATA_CONTRACTS.md, docs/evaluation-pipeline.md.

The user has NOW authorized starting application implementation, superseding the prior temporary hold documented in docs/instructions.md. Do not rewrite the other contributor's work. Work on this feature branch; do not merge or deploy without approval.

**First:** run npm install, npm run typecheck, npm test, npm run build. Fix defects and capture exact results, without weakening regression assertions.

**Then:** implement a persistent, idempotent repository (the included UpdateRepository is an interface, NOT storage); enforce server-owned actor/consent/selected meeting and repo permissions; implement real GitHub and Wispr MCP adapters behind these contracts. Bolna MCP is for managing agents and executions; live Bolna calls reach our authenticated HTTP tool endpoints. Implement get_my_brief, get_task_evidence, get_changes and record_task_update. Verify one call and one persisted read-back before polish.

**Air Agents concepts:** one Bolna voice persona with three specialist modes: Code Scout (find), Fix Navigator (locate/action), Evidence Verifier (prove). Keep taskId/contextVersion stable when switching. Do NOT imply genuine spatialized audio over PSTN. Use a three-card UI as an optional visual metaphor.

**Research-guided behavior:** keep persisted tool state separate from what was attempted to be communicated; interruptions cannot erase unfinished facts. Do not claim the user heard an utterance without explicit acknowledgement. Treat PR open vs merged, old SHA check vs current head, discussed vs accepted ownership, and save failure as independent states.

Complete three consenting phone calls strictly >45 seconds, assess actual failures, make one reviewed fix using Wispr Flow voice dictation, retest same scenario V1/V2, attach verified evidence. Never invent passing tests, consent, MCP reads, or a call outcome. Never commit secrets or private transcripts.
