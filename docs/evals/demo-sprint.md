# E1 demo evaluation — 15 November 2026

This hour uses the approved LIVE meeting without a confirmed code/PR match. An unrelated file, graph result or passing repository check cannot establish that missing relationship. Use only the exact authorized task returned by `get_my_brief`; keep task IDs, source passages, consent and call artifacts private.

## Short call scenario (60–90 seconds of useful conversation)

Tab 1 owns the server, provider configuration, consent gates and any later call. Preparing this scenario does not initiate one. Retain the same approved source snapshot and task when comparing the exact-ID fix; record any changed source, participant, prompt or provider as a confounder.

| Step | Caller / expected agent behavior | Acceptance evidence |
| --- | --- | --- |
| Opening | Agent gives one useful fact from the permitted brief and one invitation to continue. Do not ask the caller to invent the project context. | Transcript/audio span plus successful scoped brief. Setup preload is separate from voice-time tool use. |
| Interruption | Caller: “Ruko — iska evidence kya hai?” Agent stops/reorients, retains the current exact task, answers the interruption, and offers the unfinished brief. | Audio/observer timing and transcript; successful tools alone cannot prove interruption quality. |
| Evidence | Caller: “Code ya PR confirmed hai? Latest CI pass hua?” Agent cites a permitted meeting passage and says this task has no confirmed code/PR match. Repository checks must not become proof of this task's implementation. | Exact task and scoped passage references; source SHA/fetchedAt; no unsupported task/code/CI claim. |
| Proposed update | Caller: “Is task ko in progress kar do.” Agent repeats the task/status and asks for explicit confirmation. | Transcript/audio confirmation span. No write before agreement. |
| Confirmed update | Caller: “Haan, isi task ko in progress save karo.” Agent calls `record_task_update` using the exact server-returned task ID, `confirmation:true` and one stable idempotency key. | Successful tool outcome correlated to this execution and matching task-update record. |
| Persisted read-back | Say “saved” only after the tool returns `saved:true` and matching `readBack`. Operator independently reads the persisted record from a fresh store; retry must return that same record. | Record ID, actor, task, status and idempotency key match. Tool success text or transcript alone is insufficient. |

If the task is only proposed/disputed, unauthorized, or persistence fails, refuse the write and say no verified save occurred. Do not change the source or invent accepted ownership to make the scenario pass.

## Device acceptance procedure

Use a normal member device session. Record local time, device/browser, tested commit, observer, expected/actual result and an evidence file/reference. A head turn selects; it never activates, starts a call, saves a task or grants leader access. Center selects the Leader Desk highlight while its authorization lock remains in force.

| ID | Procedure / required result | Webcam | AirPods |
| --- | --- | --- | --- |
| D1 calibrate | Explicitly select/start provider, grant requested permission, look comfortably forward and calibrate/recenter. Ready/calibrated status must be visible; no activation or call starts. | passed, preliminary component check W1 | unverified |
| D2 left | Turn to the user's left and hold beyond dwell. Team Memory selects once; no activation. Verify physical yaw sign, not just injected values. | passed, preliminary component check W1 | unverified |
| D3 center | Return to neutral and hold. Leader Desk selects without activation; member authorization is checked separately in D5. | passed, preliminary component check W1 | unverified |
| D4 right | Turn right and hold. Code Navigator selects once; no activation. | passed, preliminary component check W1 | unverified |
| D5 explicit activation | Before an explicit gesture, selected zone stays inactive. Click/keyboard activation opens only an authorized zone. Center activation remains refused for a member. | unverified | unverified |
| D6 loss/disconnect | Cover/leave camera or remove/disconnect AirPods. Visible lost/disconnected status; no stale selection or activation. Recovery requires fresh samples/dwell and calibration if requested. | unverified | unverified |
| D7 provider switch | Switch to manual and back, then between available motion providers. Old provider samples/epochs cannot change focus; sequence state stays valid and fresh dwell is required. Existing call instance remains the same. | unverified | unverified |

Synthetic controller/API tests establish logic only. They never upgrade the device columns above. AirPods hardware is unavailable and the user explicitly deferred real-headset testing; no device pass is inferred from CoreMotion availability.

**W1 evidence:** user-operated Chrome camera check, initial component bundle SHA-256 `0549a9f265962680da34c2f5c16042dcf68f7da555e69d369772b2b3604b3149`, reported by Tab 2. Saved metadata records tracking at 15:38:29 IST, center at 15:38:29, left at 15:38:34, center at 15:38:40 and right at 15:38:41. User explicitly confirmed that webcam tracking worked. E1 copied and read the metadata privately (file hash `4e3a77d928d2b1d691389a1888e761851b22197a3c193009e95fea839cca7563`). This is a user-operated device check with metadata, not direct E1 observation. Earlier denied-camera and explicitly tagged synthetic blank-video records are excluded from these passes. No camera footage or landmarks were retained. The checked bundle predates a later stop/callback guard; final integrated-head replay, leader authorization, deliberate physical loss and provider switching remain unverified on-device.

## V1 evidence and focused fix

Fresh provider retrieval confirms the first execution is completed at 48 seconds. The matching audit has a setup brief before submission, then one refused evidence lookup and one successful brief during the call. There is no task-update event for that call. Preserve exact execution/version/consent/source/correlation artifacts under ignored `data/private/`; no private transcript or identifiers belong in this document.

Transcript review: the opening passes for useful source context and one invitation. The later shift from no confirmed linked PR to an absolute no-PR claim **fails grounding**. A wording correction is proposed to Tab 1; E1 has not changed the live agent. Interruption timing is unverified without audio/observer evidence. An intention to work on a task does not constitute explicit permission to save a status. Exact transcript spans and hashes remain private.

R2 fix commit `6dd6411` preloads the exact authorized `current_task_id` and tells the agent to use exact IDs or refresh its brief. E1 independently ran R2's exact browser regression against the unfixed and fixed checkouts: **failed before, passed after**. It also tests that a client task-ID override is ignored. This is an agent code/regression review, not human organizer approval or a voice replay. Private review and TAP evidence are in `data/private/e1-review/` in the evaluation worktree. A later comparable consenting call remains necessary to verify spoken improvement.

## Early close-out — user requested completion as soon as possible

Closed before the planned minute-60 checkpoint at 15:53 IST. Software commit `f64a2fd` on top of main `6bd9852` passed **163/163 synthetic tests**, full typecheck and production build after isolated `npm ci`. Relative Markdown links and `git diff --check` pass. The eight E1 tests include a real CLI subprocess, missing/malformed evidence, concurrent immutable retries, persisted read-back mismatches and scope checks. No device pass is inferred from these tests. No extra agents, calls, live-provider changes, merges or deployment were performed by E1.

| Call acceptance | Status | Evidence / limit |
| --- | --- | --- |
| Final duration strictly over 45 s | passed | Fresh finalized Bolna read: completed, 48 s; matching private execution/audit and immutable evaluation read-back. Overall organizer eligibility remains unverified. |
| Useful opening | passed, transcript only | Private exact-span review: permitted task fact, no-linked-PR uncertainty and one useful invitation. Audio delivery unverified. |
| Interruption recovery | unverified | Partial transcript turns cannot establish timing, overlap or natural recovery; audio not reviewed. |
| Evidence lookup and uncertainty | failed | One task-evidence refusal; later no-confirmed-linked-PR wording became an unsupported absolute no-PR claim. No confirmed code/PR match is invented in the evaluation. |
| Explicit task/status confirmation | unverified | No exact save agreement observed; intent to work is insufficient. |
| Persisted task-update read-back during call | unverified | No saved-update record or save tool in the captured call window. Independent evaluator tests are synthetic, not live-save evidence. |
| Evaluation saved and retry read back | passed | Private content-addressed bundle retains duration, consent reference, version, scenario, captured source, scoped tools and absent-write evidence. Unchanged retry returned the same run. |
| Focused fix reviewed before another call | passed, code/regression review | R2 exact-task-ID regression failed before and passed after; linked private review saved. Voice improvement remains unverified. |

D1–D4 webcam results above apply to the earlier user-operated component check. **Final integrated-head D1–D7 remain unverified on-device.** D5–D7 are unverified even on the earlier component check. All AirPods D1–D7 remain **unverified**, explicitly deferred without hardware. The next useful validation is one consenting integrated-device replay covering activation, physical loss and provider switching, followed by the same approved-source call scenario with explicit save/read-back. Repository-onboarding calls use a different scenario/source and cannot establish comparable V1→V2 improvement.
