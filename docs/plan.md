# Project plan

## Current status

Planning and MCP setup are in progress. Application implementation is on hold pending further user context and an instruction to begin.

## Implementation checkpoint

Last inspected: 2026-11-15, from baseline commit `80d61eeb3dfdbfe4064f0a89b712294cbed81e65` (merged planning PR #1). This is a dated checkpoint; every agent must inspect its current checkout before using it.

- **Implemented:** project documentation and shared coding-agent startup/handoff instructions in `AGENTS.md`, with a `CLAUDE.md` entrypoint. Bolna and Wispr setup evidence is recorded in [integrations.md](integrations.md); credentials live outside the repository.
- **Application:** no application source, package manifest, database, runtime endpoints, tests, or evaluation implementation exists at this checkpoint. The architecture and evaluation pipeline are designs.
- **Validation:** documentation links and whitespace are checked for the agent-instruction update. No application tests or voice calls were run for this documentation task. Earlier provider checks retain their own dated evidence in the integration notes.
- **Blockers / next steps:** await the user's next context and implementation instruction; select an authorized Wispr meeting before source ingestion. The implementation hold remains in effect.

Update this section after meaningful work with the new baseline, implementation evidence, checks/results, blockers, and next step. Keep detailed decisions in their source documents instead of copying them here.

## Preparation

- [x] Review the supplied handoff and preserve relevant technical references.
- [x] Confirm Kaam Ki Baat against the repository name and user instructions.
- [x] Record the purpose, proposed MVP, constraints, and open decisions.
- [x] Add shared agent startup, implementation verification, contributor coordination, and handoff instructions.
- [x] Register Bolna and Wispr Flow MCP in local Codex configuration.
- [x] Validate the Bolna key with a live read-only `get_user_info` request.
- [x] Discover Bolna's live tool catalog: 121 tools on 2026-11-15.
- [x] Complete Wispr browser authorization; Codex confirmed successful login after manual callback input.
- [x] Discover Wispr's live account catalog (16 tools) and inspect meeting search/transcript schemas.
- [x] Verify a bounded Wispr project-title search; it succeeded with zero matches, so no meeting was imported.
- [x] Research and document the initial tool recommendations, distinguishing live discovery from documentation.
- [x] Verify the public competition rules and 1–4 PM build window.
- [x] Design the stored call-evaluation and reviewed improvement pipeline.
- [ ] Read one user-selected, authorized Wispr meeting after authentication.
- [ ] Incorporate the next context update and settle remaining scope decisions.

## Future milestones — do not execute yet

1. Confirm the meeting, repository, participants, consent, full participant guidelines, storage, and HTTPS callback setup. After implementation is authorized, prove a real Bolna call and an authorized Wispr meeting read as independent integration gates.
2. Create the smallest service and typed evidence records. Verify ownership ambiguity, PR state, mismatched check SHA, stale evidence, and permission boundaries with focused fixtures.
3. Deliver one personalized brief and one confirmed, persisted task update, with idempotency and read-back verification.
4. Connect the live voice runtime to the narrow application tools. Verify interruptions, code-switching, failed tools, and uncertainty handling.
5. Implement the [evaluation pipeline](evaluation-pipeline.md): persist call snapshots, deterministic results, optional rubric judgments, suggestions, and agent versions. Complete at least three consenting calls strictly over 45 seconds, evaluate after each, review and apply a focused fix between calls, and replay a comparable scenario.
6. Prepare the evidence board and demo record with exact results and known limitations. Deployment requires an explicit user instruction.

The [inherited build schedule](reference/BUILD_PLAN.md) is a time-boxing reference within the verified [1–4 PM event build window](competition.md). Reserve time for calls and improvements before UI polish; a large evaluation framework must not consume the three-hour window. No teammates or live outcomes are assumed. Completed changes will be committed and pushed on a coordination branch with a concise PR when appropriate; application implementation and external operations remain subject to their separate scope.
