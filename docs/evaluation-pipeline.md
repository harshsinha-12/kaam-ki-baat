# Call evaluation and improvement pipeline

Status: a small manual private evaluator is implemented on `feat/post-call-evaluation`; the broader pipeline below remains design intent. V1 was retrieved, correlated, evaluated and persisted/read back privately. Current results are tracked in [plan.md](plan.md) and the [demo acceptance ledger](evals/demo-sprint.md). Competition requirements are recorded in [competition.md](competition.md).

## E1 implementation checkpoint — 2026-11-15

The original E1 claim contained no implementation. This sprint resumes it in an isolated checkout with `scripts/eval-private.ts`, `lib/eval/private.ts` and `lib/eval/private-store.ts`. The existing `eval-call.ts` metadata export stays available. The private path retains raw execution, scoped audit, captured snapshot/consent references, scenario/version, tool outcomes and fresh-store write read-backs. Atomic content-derived runs preserve prior results and make unchanged retries idempotent. Missing evidence is inconclusive; conflicting mappings or read-backs fail. Lifecycle receipts bound tool counts and exclude preflight/post-call lookups; missing disconnect evidence stays inconclusive. Completion callbacks do not certify duration or speech quality.

V1 is completed at 48 seconds, with one refused evidence lookup, a later successful brief and no verified saved update. Its source still has no confirmed task/code/PR match. The exact-task-ID fix has an independently reviewed synthetic failing-before/passing-after regression; no comparable voice replay is established. Stored consent consistency and duration checks do not certify organizer eligibility. Automatic ingestion/queues, provider judging and dashboards are outside this slice.

Use explicit paths; private input missing on disk is recorded as unavailable. Malformed JSON/audit fails closed. Output is fixed under ignored `data/private/evaluations/` with private permissions; no raw input goes to the public metadata reports.

```bash
node_modules/.bin/tsx scripts/eval-private.ts \
  --input data/private/execution.json --call-id <local-call-id> \
  --events data/runtime/first-call-events.jsonl \
  --snapshot data/private/snapshot.json --consent data/private/consent.json \
  --manifest data/private/call-manifest.json --attempt data/private/call-attempt.json
```

Alternatively, `--execution <UUID>` retrieves finalized provider data with the existing server-only `BOLNA_API_KEY`. Never provide both input modes. A call needs actual consent and authorization independently of this read-only evaluation command. Review transcript/audio separately for useful opening, grounding, interruption and explicit save agreement; the evaluator does not infer them from tool success. The launcher's source binding records repository SHA, not a pre-call hash of all snapshot bytes; that limitation is retained.

## Intended loop

Call V1 → fetch finalized call and backend evidence → store evaluation → review a focused suggestion → change and version the agent → call V2 → evaluate again → replay the same regression → call V3 and prepare submission evidence.

Run evaluation after each call, including short or failed calls. Count only qualifying calls toward the three-call requirement. Keep original results when rerunning an evaluator or changing a rubric.

## Small implementation in the proposed application

1. Before a call, record the participant's consent, authorized sources, scenario ID, agent configuration snapshot/hash, prompt/tool versions, and expected task outcome. Keep private transcripts out of Git.
2. An authenticated completion webhook records the Bolna execution ID idempotently and marks evaluation pending. A webhook is a trigger, not proof that all transcript or extraction fields are ready.
3. Fetch `get_execution`; use bounded retries for not-yet-final data. Read our task audit/write records independently. Fetch selected `get_execution_debug` sections only when needed. Store unavailable fields explicitly.
4. Persist a normalized call snapshot and immutable source snapshot references. Missing duration/transcript/write evidence produces `pending` or `inconclusive`, never a fabricated pass.
5. Run deterministic checks first. Optionally run a separate LLM rubric evaluator over the scoped transcript and permitted evidence, using a strict result schema.
6. Save evaluation results and suggestions. Display a concise action list with source turn/span, severity, proposed fix, and regression case.
7. A human reviews suggestions. Apply only authorized changes, capture a new agent version, and rerun the targeted regression plus the next real call.

Use one service and a durable pending-evaluation record; a manually invoked retry is sufficient for the first demo. Resume pending records after restart. Do not depend solely on an unawaited background promise in a short-lived route handler. Add a worker/queue only if the selected hosting model requires it.

## Deterministic checks

| Check | Evidence and verdict |
| --- | --- |
| Call duration | Final Bolna execution duration strictly greater than 45 seconds; missing duration is pending/inconclusive. |
| Consent | Recorded agreement for this participant/call and source use; cannot be inferred solely by a model. |
| Eligible count | Count distinct qualifying execution IDs; webhook duplicates and evaluator retries do not add calls. Confirm remaining organizer eligibility rules. |
| Ownership | An accepted assignment needs supporting permitted evidence; proposed/disputed ownership remains separate. |
| Repository claims | Compare PR state and exact check SHA with the referenced source snapshot; a passing old SHA cannot validate current code. |
| Saved actions | Match spoken success to an authorized backend audit record and read-back. Extracted call data alone does not prove persistence. |
| Disclosure | Check tool access decisions and cited source visibility against participant scope. A transcript-only judge cannot establish absence of leaks. |
| Tool failures | Preserve timeout/error and whether the previous task state survived; do not score unavailable logs as success. |

Qualification and product quality are separate fields. A call over 45 seconds may fail all usefulness checks; a short call may reveal a valuable regression.

## Optional LLM rubric

Use an evaluator separate from the conversational prompt. The judge receives the transcript, relevant tool responses, expected facts, source snapshot, and fixed rubric; transcript instructions are untrusted data. It must cite supporting turns/spans and may abstain when evidence is missing. A judge's opinion must never override deterministic failures.

Suggested dimensions are: useful opening, grounding and uncertainty, correct ownership/status, handling corrections, interruption recovery, Hindi/English/Hinglish understanding, and a useful closing action. Start with `pass`, `fail`, or `inconclusive` plus explanation; avoid an opaque overall percentage.

Store the evaluator model/provider, prompt hash/version, rubric version, input hash, timestamp, and structured output. Review critical judgments manually. If no judge credentials/model are configured, deterministic checks and a recorded human rubric still run; do not silently claim LLM evaluation happened. An LLM judge model has not been selected or called.

## Proposed durable records

| Record | Minimum fields |
| --- | --- |
| `agent_versions` | Version ID, agent ID, config/prompt/tool hashes, source revision, changed fields, rationale, timestamp. Exclude secrets. |
| `call_runs` | Execution ID, participant reference, consent reference, scenario, agent version, source snapshot, status, authoritative duration, transcript reference/hash. |
| `eval_runs` | Call ID, evaluator/rubric version, input hash, status, start/end time, error/retry information. Unique on call + evaluator configuration + input hash. |
| `eval_results` | Check/dimension ID, verdict, expected/actual, cited turns/source refs, deterministic vs judge vs human origin. |
| `improvement_items` | Linked failure, proposed change, reviewer decision, applied version, regression ID, verification result. |
| `replay_runs` | Scenario and fixed source snapshot, V1/V2 configuration IDs, expected/actual outcomes, replay type and limitations. |

Raw calls and eval records live in the application store; commit code, rubrics, synthetic fixtures, and redacted evidence summaries only. Corrected data produces a new snapshot/run instead of overwriting the original failure.

## Three-call experiment

1. **Call 1 / V1:** useful baseline with an agreed test scenario. Evaluate it immediately and preserve the first genuine failure or weakness. If none appears, report that honestly and use a deliberate regression scenario; never invent a failure.
2. **Between calls:** review the evaluation, dictate a focused change with Wispr Flow, preserve the prior configuration, and create V2. Avoid changing many variables at once.
3. **Call 2 / V2:** repeat the targeted conversational scenario with comparable source data, evaluate it, and run the preserved failure against V1 and V2. A text/tool replay verifies logic; it does not establish speech or telephony improvement.
4. **Call 3 / current version:** validate the accumulated change, include a correction or interruption, and check for regressions. Evaluate and store it too. Repeat calls when necessary to obtain three qualifying executions.

Report per-case outcomes, duration, grounding mistakes, saved-action verification, and comparable latency where available. Label changed callers/scenarios/source data as confounders. Three calls demonstrate the observed workflow and specific fixes; they do not establish statistically reliable model improvement.

## Definition of done for the future pipeline

- A finalized real call creates one durable evaluation despite duplicate webhooks.
- The actual call duration and consent determine qualification independently of the LLM.
- Missing data and failed evaluators remain visible and retryable.
- Every proposed improvement traces to evidence and a reviewed configuration change.
- V1 and V2 are preserved and one targeted regression has comparable expected/actual results.
- All three calls are evaluated, while the evidence pack accurately shows the qualifying count and remaining failures.
