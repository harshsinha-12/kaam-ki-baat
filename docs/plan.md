# Project plan

## Current status

The architecture is converged (see [architecture.md](architecture.md) and [integration-design.md](integration-design.md)). The user has authorized the first application implementation, to be carried out by Claude Opus on its own branch. No application code has been written yet. Real calls, agent changes, deployment, and merging still need separate instructions.

## Implementation checkpoint

Last inspected: 2026-11-15, from baseline commit `80d61eeb3dfdbfe4064f0a89b712294cbed81e65` (merged planning PR #1). This is a dated checkpoint; every agent must inspect its current checkout before using it.

- **Implemented:** project documentation and shared coding-agent startup/handoff instructions in `AGENTS.md`, with a `CLAUDE.md` entrypoint. Bolna and Wispr setup evidence is recorded in [integrations.md](integrations.md); credentials live outside the repository.
- **Application:** no application source, package manifest, database, runtime endpoints, tests, or evaluation implementation exists at this checkpoint. The architecture, integration design, and evaluation pipeline are written down; the code is next.
- **Validation:** see the pull request for this change. No application tests or voice calls have been run.
- **Blockers / next steps:** (1) the user supplies one approved Wispr meeting ID or link; (2) the user approves one repository for the demo; (3) Claude Opus starts the first slice on its own branch, following the build order in [architecture.md](architecture.md) §9; (4) pattern A or B for Bolna is confirmed (see [decisions.md](decisions.md), D-018 and D-019).

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
- [x] Write the converged architecture, the Bolna and Wispr integration design, and the decision log (2026-11-15, this branch).
- [ ] Read one user-selected, authorized Wispr meeting after authentication.
- [ ] Settle the remaining open decisions in [decisions.md](decisions.md) (D-019 to D-023).

## Future milestones — do not execute yet

1. Confirm the meeting, repository, participants, consent, full participant guidelines, storage, and HTTPS callback setup. After implementation is authorized, prove a real Bolna call and an authorized Wispr meeting read as independent integration gates.
2. Create the smallest service and typed evidence records. Verify ownership ambiguity, PR state, mismatched check SHA, stale evidence, and permission boundaries with focused fixtures.
3. Deliver one personalized brief and one confirmed, persisted task update, with idempotency and read-back verification.
4. Connect the live voice runtime to the narrow application tools. Verify interruptions, code-switching, failed tools, and uncertainty handling.
5. Implement the [evaluation pipeline](evaluation-pipeline.md): persist call snapshots, deterministic results, optional rubric judgments, suggestions, and agent versions. Complete at least three consenting calls strictly over 45 seconds, evaluate after each, review and apply a focused fix between calls, and replay a comparable scenario.
6. Prepare the evidence board and demo record with exact results and known limitations. Deployment requires an explicit user instruction.

The [inherited build schedule](reference/BUILD_PLAN.md) is a time-boxing reference within the verified [1–4 PM event build window](competition.md). Reserve time for calls and improvements before UI polish; a large evaluation framework must not consume the three-hour window. No teammates or live outcomes are assumed. Completed changes will be committed and pushed on a coordination branch with a concise PR when appropriate; application implementation and external operations remain subject to their separate scope.
