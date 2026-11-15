> Planning reference adapted from the user-supplied handoff on 2026-11-15. Project naming has been updated. This is design intent, not implemented behavior. Current user instructions and [the active plan](../plan.md) take precedence.

# User experience: low-friction and evidence-driven

## First 20 seconds
1. User opted into receiving a call and consented to allowed meeting/repo context.
2. Kaam Ki Baat speaks **one useful fact**: "From your team discussion, you own testing. I found a relevant PR still awaiting review."
3. A single invitation: "Want the exact issue/file or your next action?"
4. The response returns a useful explanation with a verifiable source. No long questionnaire.

## Natural requests
- "What should I do first?" -> scoped next action; explain uncertainty.
- "Where is it in the code?" -> pinned path/PR + explanation; avoid fabricated line numbers.
- "But I thought it was already done." -> distinguish source discussion, PR, CI, actual verification.
- "Who said that?" -> source speaker + supporting meeting passage where permitted.
- "I'm blocked by the API key." -> record blocker with confirmation, don't request the secret aloud.
- "That's not mine." -> mark dispute / request human review; do not silently reassign.
- "What changed since yesterday?" -> accurate delta with timestamp.

## After the call
- One action card: title, owner, accepted/proposed status, next step, evidence refs, latest repo SHA/check, audit ID.
- Optional light web panel: "What was said / What code shows / What's verified / What's next".

## Qualifying test conversations
- Test A, developer: discuss next task, exact code area, and what a passing test would mean.
- Test B, reviewer: inspect PR state, changed files, and potential blocker.
- Test C, demo lead: determine what's safe to demonstrate, what's only proposed, and what's still unverified.
- Aim for engaging 60–90-second calls without padding; verify duration >45 seconds in actual Bolna logs.
