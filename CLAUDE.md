# Claude Code project instructions

This project is **Kaam Ki Baat** (not CueBack or Bola Ya Bana).
Read AGENTS.md and docs/OPUS_START.md first, then docs/context.md, docs/instructions.md, docs/plan.md, docs/IMPLEMENTATION_STATUS.md, docs/SPATIAL_SPECIALISTS.md and docs/reference/DATA_CONTRACTS.md.

The user has authorized scoped implementation on the feature branch. Do not merge or deploy without approval. Do not infer that live Wispr, Bolna or GitHub integrations work merely because the interface or MCP connection exists.

Use one Bolna voice persona with three Air Agents-inspired logical specialists: Code Scout (find), Fix Navigator (locate), Evidence Verifier (prove). Preserve task context when switching. Do not claim physical spatial audio on a phone call.

Priority: install dependencies, typecheck, test, implement an access-scoped persistent store and provider adapters, then one verified real call. Keep exact repo/SHA/file source references and distinguish discussed, accepted, merged, check-passed and production-verified states. Tool success requires an actual persisted read-back. Keep unfinished spoken-result items across interruptions.

The two sponsor integrations are essential: Wispr read-only MCP for a specifically authorized meeting, and Bolna MCP for agent management plus runtime HTTP functions for the live voice agent. No credentials or private transcripts in Git. Record observed test and call results; label all synthetic fixtures and unverified claims.

See docs/OPUS_START.md for the full handoff.
