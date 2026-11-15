# Project context

Status: application core, spatial browser workspace, source import and Bolna configuration are implemented as tracked in [plan.md](plan.md). The user approved one Wispr source, this repository, Speaker 1 identity and agent setup/testing. Real voice/call behaviour remains unverified. All calls are held for one final user confirmation naming the specific consenting participant (D-038).

## Purpose and users

Kaam Ki Baat helps teammates answer: What did we agree? What is my responsibility? Where is the related code? What evidence shows its current state? What should I do next?

Initial target users are small engineering and hackathon teams, junior engineers joining a repository, leads, and reviewers. Start a conversation with useful context instead of asking the caller to recite the project or invent a plan.

## Scope

The handoff's proposed MVP is one specifically authorized meeting, one selected GitHub repository, and three personalized task briefs. A Bolna call provides a short brief, answers evidence-backed follow-ups, and records a confirmed task update in our own store only after verifying persistence.

Keep these states distinct: mentioned / proposed / accepted ownership; open / closed-unmerged / merged PR; pending / passed / failed checks for an exact SHA; user-reported completion / verified completion. Deployment needs its own evidence.

The primary surface is a telephone call. An optional evidence board can show what was discussed, what code shows, what is verified, and the next action. No autonomous code repair, merging, deployment, broad repository indexing, or vector database is planned for the MVP.

On 2026-11-15 the user requested portfolio-style website context and DOM tool actions while retaining Bolna as the voice provider. Spatial browser controls come first: meeting context on the left and code on the right, with AirPods motion deferred. PR #9's broader [spatial live-context proposal](spatial-live-context-v2.md) reserves the center for a future authenticated Leader Desk. The first browser slice keeps that desk locked; camera selection, live STT and leader escalation remain proposed. See [Bolna browser integration](bolna/spatial-browser.md) for the implementation and verification boundary.

The [competition page](competition.md) confirms a three-hour build window (1–4 PM on 2026-11-15), voice-only building through Wispr Flow, teams of up to four, at least three consenting test calls strictly over 45 seconds, and evidence of improvement. The user additionally requests a stored evaluation after each call and a reviewed fix before the next call. A comparable regression replay will help distinguish a configuration fix from changed source data or caller behavior.

## References and existing work

The user supplied a handoff ZIP (attachment `file_b47447ad-eb63-4cb1-9dd2-9b0a8b9f3d34`). Relevant technical documents are adapted in [reference/](reference/README.md); sample application folders, fixtures, and the implementation prompt were not imported.

The latest user instructions establish Kaam Ki Baat as the only current name and require Bolna AI MCP and Wispr Flow MCP. These instructions take precedence over inherited references. See [integrations.md](integrations.md) for source links and connection evidence. Keep credentials and private meeting data out of the repository.

## Decisions and open questions

Confirmed by the user:

- Use Kaam Ki Baat, matching the repository name.
- Integrate and maintain planning documentation. Application implementation is authorized to begin (D-006 in [decisions.md](decisions.md)).
- Add and explore Bolna AI MCP and Wispr Flow MCP.
- Validate the Bolna key before using it for operational work.
- Commit and push completed documentation and future authorized implementation changes as work progresses.
- Use a branch and a concise PR when needed to coordinate concurrent contributors; the user will handle merging.
- Plan a call-evaluation pipeline that stores results and tracks improvements across agent versions.

Proposed by the handoff, pending further context:

- One Next.js + TypeScript service with isolated provider adapters and strict schemas.
- Deterministic status reconciliation; an LLM may suggest evidence matches but cannot confirm them without support.
- Four narrow runtime tools: personal brief, task evidence, changes, and a verified task update.

Open decisions:

- Meeting/repository selection is confirmed in D-031/D-032. The source has no confirmed code match here. Actual phone testers, consent and numbers remain pending.
- What caller verification and participant disclosure rules will apply?
- Which storage and hosting setup should support HTTPS callbacks?
- What additional rules appear in the full participant guidelines, including call eligibility and pre-existing-code restrictions?
- Which Bolna speech providers and voices work best in comparable Hindi, English, and Hinglish call tests?
