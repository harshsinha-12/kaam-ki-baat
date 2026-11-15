# Demo operation and final call confirmation

This runbook separates checked setup from an actual call. The [plan](../plan.md) records the current evidence and lane ownership. See [voice configuration](agent.md) and [browser setup](spatial-browser.md) for provider details.

## Before the final confirmation

Run from the checkout hosting the current server:

```sh
npm run demo:preflight
```

If the readiness command is on a separate review branch, it can inspect the running checkout without changing it:

```sh
npx tsx scripts/demo-preflight.ts --root /absolute/path/to/running-checkout
```

The command loads that checkout's ignored `.env.local`, selected snapshot, and saved `data/private/bolna-agent-readback.json`. Save a fresh `get_agent` response there before running it. The default checks all six evidence/browser functions; `--phone-only` checks the original four. A saved response is a point-in-time check, not a fresh provider query.

The command validates approved LIVE evidence and participant scope, complete code SHA, source freshness, expected callbacks and server credentials. It then reads the public health endpoint and checks that anonymous requests and an invalid caller token are rejected. It never issues a participant token, starts a provider session, calls a participant, or updates a task. Its redacted report goes to ignored `data/private/demo-readiness.json`.

`setupReady: true` means those setup checks passed. Warnings remain visible. A meeting without a supported task-to-code link can still support a truthful brief and saved action; it cannot support claiming that an unrelated repository implements its decisions. No matching PR means say the link is unconfirmed.

Calls remain held even when preflight passes. Obtain **one final confirmation** naming the participant, recording their consent to the test call/recording and permitted meeting disclosure, choosing telephone or browser, and authorizing the call. Reuse this confirmation; do not ask again for the same call. Phone numbers stay in secure input or ignored private configuration, never Git or a public report. An owner-authorized text preview is not telephone consent.

## After confirmation

1. Record real participant consent and issue the scoped call token using `npm run call:token`. Do not substitute a synthetic preview session.
2. Preserve the current agent configuration hash/version and exact source snapshot. Prepare the private opening brief and token context before calling. Do not send source data outside the approved participant's scope.
3. Start exactly the confirmed call. Ask about the task, interrupt with a code question, ask about current CI evidence, then explicitly confirm a status update. Verify persisted read-back before saying it was saved. For the browser variant, check actual DOM focus and the action receipt before claiming the page changed.
4. Preserve the Bolna execution ID and matching local call ID. Wait for final execution data; a disconnected but finalizing call does not establish duration.
5. Run the existing recorder:

```sh
npm run eval:call -- --input data/private/execution.json --call-id <local-call-id>
```

The command saves an immutable metadata report under `docs/evals/`. Missing audit or communication evidence stays unavailable. The report does not export transcripts, prompts, phone numbers, source passages or provider errors. It also does not automatically prove correlation, spoken grounding or read-back; review the private trace and persisted record.

## Three calls and submission

- Evaluate every call, including failed/short calls. Only count distinct finalized execution IDs with duration **strictly greater than 45 seconds**, verified consent and organizer eligibility. Aim for useful 60–90-second calls; never pad a failed call.
- After V1, review one actual weakness, dictate the focused fix through Wispr Flow, preserve V1, and record V2's configuration. Repeat the same source/scenario in V2 where possible and identify confounders. Review V2 before V3 and evaluate V3 too.
- Submit the configured agent reference, three eligible call records, the redacted evaluations, one supported before/after improvement, and a factual Wispr Flow usage note. MCP retrieval alone does not prove voice-only development. Keep unfinished calls, missing audio evidence and uncertain code links explicit.
- Keep changes on review branches. Deployment and merging retain their separate authorization requirements. After any incoming merge, refresh and rerun the relevant checks before the next call.

Real audio, provider token substitution, interruption quality and duration remain unverified until a consenting call. Browser call eligibility depends on the participant guidelines; do not silently equate a browser session with an eligible telephone test.
