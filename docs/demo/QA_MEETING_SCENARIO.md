# QA Scenario — Kaam Ki Baat team sync (fictional)

> **SIMULATED TEST ONLY.** This is a deliberately authored rehearsal. It is **not** a real Wispr Notetaker meeting, an actual consent record, a GitHub change, or evidence of a production incident. Do not mark it `LIVE` or say it happened.

## How to use it

**Option A — fastest:** Paste the transcript below into a new [Wispr Scratchpad](https://docs.wisprflow.ai/articles/9618237082-using-the-scratchpad-to-save-and-edit-notes) note titled `SIMULATED — Kaam Ki Baat QA sync`. Scratchpad can store typed/pasted notes and sync them. If your authorized Wispr MCP connection exposes that note, retrieve it as a `scratchpad_note`, **not** a recorded meeting. It does not automatically populate Kaam Ki Baat's server; import only after explicitly selecting the source and preserving the synthetic label.

**Option B — real Notetaker integration test:** Two participants explicitly consent and speak a fresh meeting about these topics while Wispr Notetaker records. Fetch that *new actual meeting* via MCP after sync. The actual words, speakers, meeting ID and approval status—not this fictional script—become the source. Don't replay fabricated speaker labels as a real recording.

**Option C — deterministic backend tests:** The repository already contains `data/demo/meeting.kkb.json`, `data/demo/project.fixture.json` and `data/demo/snapshot.fixture.json`. They exercise the same concepts with synthetic data. Use `npm run snapshot:fixture`, never replace private LIVE evidence silently, and use an isolated test EventStore. These fixture schemas and this text are independent test inputs; a pasted Scratchpad note is not automatically mapped into the existing task IDs.

## Copy this conversation into Scratchpad

**Leader:** Okay, let's agree on today's Kaam Ki Baat priorities. We need answers grounded in meeting evidence and the actual GitHub commit—not just a convincing AI summary.

**Teammate:** I get the meeting part. But suppose the voice agent says a task was saved and the database update actually timed out. How do I find where that should be prevented?

**Leader:** Start with the real `persistVerifiedUpdate` function in `lib/core/persist-update.ts`. Its job is to check a stored record before returning success. Review the relevant `tests/persist-update.test.ts` regression. This is an investigation task, not proof that production has a bug.

**Teammate:** Can I take responsibility for testing the save-and-read-back behavior, including a timed-out write and a retried request?

**Leader:** Yes, please own those regression tests. I will review any proposed fix and handle the leader approval in our demo. Neither of us should call it fixed just because a pull request exists.

**Teammate:** Fine. I'll own the read-back tests. If they fail, I'll report the exact failure and commit SHA. If they pass, I'll still distinguish test success from production verification.

**Leader:** Good. Our public graph view may show an older code snapshot. Its file and function pointers must always identify the exact SHA. If the graph is stale, the navigator should tell us and use an approved current snapshot instead of pretending nothing changed.

**Teammate:** One more thing: is the code freeze 3:30 or 3:45?

**Leader:** We have **not approved either time yet**. We'll decide after checking CI for the current commit. Please ask me later using Team Memory's leader-clarification flow. Do not infer that the later time is approved.

**Teammate:** Who's recording the demo video?

**Leader:** That's still **unassigned**. We discussed it, but nobody accepted ownership.

**Teammate:** For Bolna testing, I'll recruit consenting participants and check their actual execution durations. We should only count calls over 45 seconds.

**Leader:** Agreed. And don't copy private meeting notes or phone numbers into the public repository. If someone asks what changed, show them a source-linked decision, exact code pointer and current status.

**Teammate:** Understood. My confirmed action is regression testing. Code-freeze time and demo-video ownership are still open questions. I'll start by finding `persistVerifiedUpdate`.

## Evaluation questions and expected decisions

| Natural question | Expected result | Evidence required |
| --- | --- | --- |
| `Who owns the save read-back tests?` | **Accepted: teammate** | Teammate explicitly accepts ownership in this simulated conversation |
| `Code freeze 3:30 hai ya 3:45?` | **Unresolved**; offer leader escalation | The leader explicitly deferred the decision |
| `Is the demo video assigned?` | **Unassigned**, not a confirmed task for anyone | Leader says nobody accepted it |
| `Where exactly does the save verification happen?` | **Candidate**: `lib/core/persist-update.ts` → `persistVerifiedUpdate` and `tests/persist-update.test.ts`; verify on current pinned SHA | Current repo source, not the synthetic transcript alone |
| `Does passing CI mean it works in production?` | **No**; latest check must match current commit, and tests are not production proof | GitHub check SHA and application status logic |
| `What if the leader is unreachable?` | Ticket remains pending; no invented answer | Verified escalation event and state |

## Real integration gate

First check `GET /api/health`; it must show `snapshot.loaded=true`, a correct source label, the repository and SHA. A public app with no working snapshot must NOT be described as live Wispr+GitHub memory. Hosted Vercel requires a configured shared snapshot store and durable event store, not a developer-machine absolute file path. Preserve `FIXTURE` on all synthetic inputs.
