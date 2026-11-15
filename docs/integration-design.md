# Integration design: Wispr Flow and Bolna

Status: **design.** Connection checks are recorded in [integrations.md](integrations.md). Nothing here means a runtime integration works yet. Where a claim comes from a reference rather than a live check, it is labeled.

## 1. The short version

- **Wispr Flow** gives us meeting facts. We read them on our server, through the Wispr MCP, and store only the meetings the user approved.
- **Bolna** runs the phone call. It asks our server for facts and sends us the outcome. Bolna never holds our data, and our server never trusts Bolna to say who is calling.
- **Our store** is the only source the call answers from, and the only place a saved update is written.

## 2. Summary table

| | Wispr Flow | Bolna |
| --- | --- | --- |
| Role for us | Source of meeting evidence | Phone call runtime (speech, turn-taking, voice) |
| How we connect | Remote MCP at `https://api.wisprflow.ai/connect/mcp`, browser OAuth | Bolna API key for management; our HTTPS endpoints for calls |
| Who calls whom | Our server calls Wispr | Bolna calls our server during a call |
| Access | Read-only | Bolna can read only the four tools we expose |
| Where it runs | Our server, before a call | During the call, plus a webhook after it |
| Verified so far | Login succeeded; 16 tools listed; a bounded search ran and returned zero matches | Key validated with a read-only account call; 121 tools listed; no agent created; no call placed |
| Not verified yet | Reading one approved meeting end to end | Everything that touches a real call |

## 3. Wispr Flow: meeting evidence

### What we may use

- `search_meetings`: find a meeting by title or date, with a bounded `limit`. It does not search transcript text.
- `get_meeting`: summary, notes, and attendees for one exact meeting ID.
- `get_meeting` with `view_transcript`: transcript pages, using `start_char` and `char_limit` (default 12,000 characters, maximum 40,000). Keep reading from the returned offset until the transcript is complete.

Other Wispr tools (calendar, folders, contacts, scratchpad, and share links) are not used in the MVP unless a specific question needs them.

### What we store

Each stored passage keeps:

- meeting ID
- speaker (as Wispr reports it)
- character start and end
- a hash of the text
- the date we read it
- a visibility label: `private`, `participant`, or `team`

We store passages, not whole transcripts, and only from approved meetings.

### Import flow (server side, before any call)

1. A person selects one meeting ID and confirms it is approved for this project.
2. The server reads its summary and transcript pages.
3. The server writes passage records with their provenance.
4. Reconciliation uses those records. The call reads from the store, not from Wispr.

### Boundaries

- Wispr OAuth is **account-wide**. Our application must choose which meetings enter the project. Our own permission rules control what each caller may hear.
- Wispr MCP is read-only. It cannot create tasks or edit meetings.
- It does not expose ordinary dictation history, and it is not a live speech stream.
- Shared meetings show what their sharing policy allows. Owner-private notes stay hidden.
- Wispr tools are not available inside the phone call. Only our server calls Wispr.

### Voice-only build rule

The competition requires building with Wispr Flow dictation, with no typing. MCP retrieval does not count toward that rule. The build log must record what was dictated with Wispr Flow and what was typed, if anything.

### Fallback

If the live MCP read fails, the team may use a transcript snapshot the user has approved. It must be labeled `FALLBACK: not live MCP`. The project must not describe a fallback as a working MCP integration.

## 4. Bolna: the phone call

### What Bolna does

Bolna handles speech recognition, turn-taking, and the voice. It calls our server for facts. It sends a webhook when a call finishes, with the call's duration and transcript.

### Two integration patterns

Both patterns use the same runtime tools. They differ in how Bolna reaches our server.

| | Pattern A: custom functions | Pattern B: custom language model |
| --- | --- | --- |
| How it works | The agent calls our tool endpoints when it needs a fact or a save. | Bolna sends each conversation turn to our OpenAI-compatible endpoint. Our server runs the turn and answers. |
| Strength | Each tool call is explicit, typed, and logged. Writes are visible as separate calls. | Our server controls every answer. |
| Risk | More round trips add latency. | The model's reply and any save are harder to separate and audit. |
| Evidence so far | Listed in the Bolna tool catalog; custom function docs are on Bolna's site. | A reference project (Voice Memory) uses this pattern. Its notes say Bolna sends no call ID to the custom model, so identity must come from `user_data`. |

**Proposed:** Pattern A for all actions and saves, with a short per-call token passed through `user_data`. Pattern B may be reviewed later for conversational turns. This is **open**, pending confirmation of Bolna's current documentation. Record the choice in [decisions.md](decisions.md).

### Per-call identity

1. Our server verifies the teammate (for example, a one-time sign-in).
2. It creates a call record: participant, approved meeting, approved repository, consent, and the scenario.
3. It issues a short-lived, single-use call token tied to that record.
4. It starts the outbound call with the token in `user_data`. The token is the only identity Bolna sends us.
5. Every tool request must include the token. The server looks up the record and sets the caller's identity from it.
6. The model's arguments never set the participant or actor ID.

A phone number is not identity. A caller who is not verified gets no memory and no private evidence.

### Tool requests

- Requests use `Authorization: Bearer` with a server-owned key. The browser never sees Bolna keys.
- Every write requires `idempotency_key`. Repeating the same key returns the first result.
- A write succeeds only after the stored record is read back. Otherwise the answer is "I could not save that."

### Completion webhook

- Bolna calls our webhook when a call finishes. The webhook must be verified with Bolna's signature scheme, which **we have not yet confirmed from the docs**.
- The webhook only creates a pending evaluation. It does not decide that the call passed.
- Duration comes from Bolna's execution record (`get_execution`), not from the webhook. A call qualifies only if its duration is **strictly greater than 45 seconds**, with consent recorded.

### Management through Bolna MCP

The Bolna MCP is for development and debugging only. It can list and inspect agents, search docs, and read executions. Creating or changing agents, and placing calls, happen only after the user authorizes them.

### Speech settings

Voice and language settings are not chosen yet. Hindi, English, and Hinglish will be compared on the same short script: names, repository terms, an interruption, silence, a failed tool, and a corrected ownership claim. Choices will be recorded from observed results, not from documentation alone.

### Known unknowns

- Whether custom functions send the same token on every request, and how they handle timeouts.
- Whether `user_data` placeholders work in the welcome message.
- How first-audio latency compares with our target.
- Which signature scheme the webhook uses.

## 5. What is verified, and what is not

| Claim | Status | Evidence |
| --- | --- | --- |
| Bolna key works for account reads | Verified | Read-only `get_user_info` call, 2026-11-15 |
| Bolna exposes 121 tools | Verified | Live `tools/list`, 2026-11-15 |
| Wispr login and tool listing work | Verified | Live MCP `tools/list` after login, 2026-11-15 |
| Wispr search endpoint responds | Verified | Bounded search returned zero matches, 2026-11-15 |
| A real meeting can be read end to end | **Not verified** | Waiting for one approved meeting ID |
| Bolna can call our tool endpoints | **Not verified** | No endpoint exists yet |
| A real call lasting more than 45 seconds | **Not verified** | No call has been placed |
| Saved updates survive a read-back | **Not verified** | No write path exists yet |

## 6. Open questions for the user

1. Which Wispr meeting is approved for the project? Please share its ID or link.
2. Which repository is approved? The current repository has no issues, PRs, or code to read.
3. Which participants have agreed to take part in calls?
4. Pattern A or B for Bolna, or both? (Recommended: A for actions and saves.)
5. Where should our HTTPS endpoints run, and what storage will the first slice use?
