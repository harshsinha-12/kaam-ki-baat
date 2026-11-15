# MCP integration setup

Checked on 2026-11-15. MCP registration, authentication, live tool discovery, and application integration are separate checkpoints.

## Current live integration — 2026-11-15

**Latest R2 result:** the root runtime now serves the intended private LIVE snapshot. Local/public health and correctly authenticated board reads return 200 with matching label, repository, SHA and fetchedAt. All six Bolna callback URLs, bearer headers and call-token mappings use the current HTTPS origin; the authenticated completion webhook also passed fresh persisted read-back. Harsh explicitly consented, completed trial-recipient verification and authorized a retry after the first HTTP 400 refusal. The accepted call finalized as **completed, 48 seconds, user_hung_up**; runtime callbacks include completed. Provider logs and the local audit show one task-evidence refusal (meeting title supplied as task ID) and one successful brief. No status update was saved. Execution/version/correlation and raw logs stay private; the [agent-reviewed metadata evaluation](evals/3742594a-dae4-4d64-97aa-13cdc039f31f.md) excludes setup preflight calls. The task-ID preload/prompt fix is regression-tested; no second call has been started. R1's outage/zero-execution statements below are historical.

**Latest R1 availability recheck:** fetched main is `daf6d28` (Graphify and landing merged). The configured local service currently refuses connections on port 3000, and the saved public HTTPS origin returns **530** for health and board. Earlier successful health/auth checks below are historical. Live Bolna reads still show the processed Kaam Ki Baat agent with six configured functions, bearer headers, call-token templates and dynamic opening; its execution history is empty. Account credit and concurrency are available, but no account phone numbers are listed. This private runtime has browser calls disabled and no callback key; the agent has no completion webhook. Restore service/HTTPS and verify the intended snapshot before a consenting call; independently verify an outbound provider/caller-ID route for telephone testing. No provider session or call was started by this audit. See [first-call readiness](plan.md#3a-distance-to-the-final-product).

- User approved one shared Wispr note, this repository, and their Speaker 1 mapping. `resolve_share_link` returned the complete normalized transcript (explicit end marker). Five exact passages with speaker, offsets, hashes and source modification time were retained privately; the temporary full transcript response was removed after extraction.
- The source describes a different product domain. The current LIVE snapshot has two tasks, no asserted PR link, and checks read from the repository's pinned commit. A LIVE label describes real source reads, not a confirmed meeting-to-code match.
- Created the Kaam Ki Baat Bolna agent under the user's authorization. Persisted `get_agent` read-back verified all six function names, callback URLs, server-key authentication, call-token mapping, dynamic opening and spatial prompt. A redacted profile is in [agent-profile.redacted.json](bolna/agent-profile.redacted.json); the ID, keys and full payload/read-back stay in ignored private files.
- Provider validation required Sarvam voice language in `provider_config`. MCP `update_agent` reported success for a tool change but read-back still showed four tools; the official v2 PUT then persisted all six. No management success was inferred without that read-back.
- A nine-turn TEXT_PREVIEW against the real runtime passed, including a refused unconfirmed save, persisted isolated save/read-back, idempotent retry, proposed-ownership refusal and unauthorized-task refusal. Preview events are separate from live call events. This is not a Bolna conversation or telephone evidence.
- LIVE HTTP preflight verified the owner brief, scoped meeting passages and rejection of a browser-session request without fresh recording consent. Browser calling is configured but disabled locally under the final named-participant call hold (D-038). The consent checkbox is an additional runtime gate after that confirmation. No provider audio session or telephone call has been started by this lane.

## Current-system reconnection — 2026-11-15

The current Codex configuration initially had neither server registered. With the user's authorization, both were reconnected on this Mac:

- **Bolna:** full endpoint registered with bearer authentication in user-only Codex configuration (mode `0600`). Live MCP initialization and paginated `tools/list` returned **121 tools**. A fresh read-only `get_user_info` completed without a tool error; account details were withheld.
- **Wispr Flow:** endpoint registered; browser OAuth completed and Codex reported `Successfully logged in`. The saved Codex OAuth credential was then used for live MCP initialization and `tools/list`, returning **16 tools**, including `search_meetings` and `get_meeting`.
- These are live connection/catalog checks, not a real meeting import or a telephone-runtime test. No meeting content was read during reconnection. The user still needs to select the approved meeting and confirm the demo repository.
- Newly registered tools are not exposed natively in this already-running session. Verification used the remote MCP protocol with the saved credentials; a fresh Codex session may be needed for native tool exposure. Credentials and OAuth callback values are excluded from Git.

## Bolna AI

- Landing page: <https://mcp.bolna.ai/>
- Full MCP endpoint: `https://mcp.bolna.ai/api/mcp`
- Transport: Streamable HTTP; authentication: Bolna API key as a bearer token.
- Registered as `bolna` in this Mac's user-level Codex configuration.
- The supplied key passed a live, read-only `get_user_info` call before further account operations. Private account output was withheld.
- Live `tools/list` returned **121 tools**. Selected schemas were inspected, and `search_docs` was exercised for custom functions and multilingual voice behavior.
- Credentials are outside this repository in user-only Codex configuration (mode `0600`). No key is included in project files.
- At the initial connection check no agent had been created or changed. The current configured-agent evidence is recorded above; no telephone call has been placed.

The public documentation shows different tool counts in different pages; use the actual discovered catalog for implementation. The full endpoint is the intended connection: Bolna's separate Claude directory connector has a smaller capability set.

## Wispr Flow

- Official remote endpoint: `https://api.wisprflow.ai/connect/mcp` (no trailing slash).
- Registered as `wispr-flow` in this Mac's user-level Codex configuration.
- Uses browser OAuth with the correct personal/work account; no Wispr API key is required.
- The first automatic login attempt ended with `timed out waiting for OAuth callback`. This establishes a missing callback, not an invalid account or a proven network fault.
- Retried with `codex mcp login wispr-flow --no-browser`. The user completed browser authorization and supplied the final callback URL to the hidden input.
- Codex then reported `Successfully logged in to MCP server 'wispr-flow'.` OAuth credentials are managed outside the repository by Codex.
- Live MCP initialization and `tools/list` succeeded after login, returning **16 tools**. The actual meeting search and transcript-read schemas were inspected. A selected meeting/transcript import is a separate follow-up; do not claim it has happened.
- A live, bounded `search_meetings` request for `Kaam Ki Baat` succeeded and returned zero matches. This verifies the read endpoint, not the existence or import of a project meeting. The next source check needs a selected meeting ID/link or its recorded title/date.

If login times out again, start a fresh login rather than reusing an old callback. With `--no-browser`, complete sign-in, authorize the account, and supply the final browser URL to Codex's hidden callback input even if the localhost page fails to load. Use secure input for the callback; it is a one-time authorization result, not a password.

Official Wispr guidance says MCP is read-only. It can expose permitted meeting summaries, notes, transcripts, attendees, calendar context, and shared-note links. It cannot write tasks, edit meetings, or read ordinary dictation history. Search does not search transcript text; request the selected transcript explicitly and handle pagination. Shared-note transcript access is narrower than summary access.

Wispr authorization is account-wide, with no per-meeting OAuth consent. Kaam Ki Baat must explicitly select approved meetings and filter what each participant may hear. Organization policy, HIPAA restrictions, retention, and account access can limit the returned tools or content. The current help-center guidance takes precedence over older blanket Cloud Sync requirements in the plugin README.

## Developer tools and telephone runtime

### Graphify code context — 2026-11-15

The user requested Graphify for codebase knowledge transfer and linking context. Graphify is an optional local build tool, not a registered MCP server or a telephone provider. Official documentation and export source were inspected, then Graphify **0.9.100** was run with an isolated Python 3.12 tool environment against the pinned fixture code: **147 usable nodes, 330 edges, 27 code files**. Import and Code Scout retrieval returned exact source locations and relationship confidence. Generated artifacts remain ignored under `data/private/`. No meeting was imported, external Graphify account connected or Bolna agent changed. Runtime setup and boundaries are in [code context](code-context.md). End-to-end voice latency remains unmeasured.

### Spatial browser compatibility — 2026-11-15

Bolna MCP documentation reads and public SDK source inspection established a supported design path: `@bolna/web-call` for browser audio, custom HTTP functions for scoped page context and commands, and our own browser action/acknowledgement relay. The portfolio instead uses WebRTC with an OpenAI data channel for its direct tool loop. No equivalent direct function-call/context-update channel appears in Bolna's current public SDK surface. See [spatial browser implementation and setup](bolna/spatial-browser.md) for pinned sources, the session-endpoint documentation discrepancy, and exact verification limits. These were documentation/source reads, not provider session/call tests. No OpenAI runtime was added. AirPods head motion remains deferred as the user requested.

These MCP connections let the coding client inspect sources and configure/debug Bolna. They do not automatically make Wispr tools available inside a telephone call. The future runtime needs an authorized MCP client/session for selected source ingestion and narrow authenticated application endpoints exposed through Bolna custom function calls. Task writes belong in our own store.

A fresh coding session may be needed to expose newly registered servers as native tools in the host. This session's Bolna and Wispr checks used the real remote MCP protocol directly with their saved credentials; no simulated catalogs were substituted. Do not interpret missing hot-reloaded tools as proof that server registration failed.

## Sources

- [Bolna setup](https://www.bolna.ai/docs/mcp-quickstart.md)
- [Bolna tool list](https://www.bolna.ai/docs/mcp-tool-list.md)
- [Bolna custom functions](https://www.bolna.ai/docs/tool-calling/custom-function-calls)
- [Wispr connection and access guide](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server)
- [Official Wispr plugin](https://github.com/Wispr-AI/wispr-flow-plugin)

Final startup validation (2026-11-15): after restarting the owned production service against the newly saved selected snapshot, both local and public HTTPS authenticated board metadata match the private LIVE snapshot exactly, including repository, SHA and `fetchedAt`. Unauthenticated evidence/spatial tool requests return 401. An authenticated browser start returns 503 under the call hold. No browser consent receipt or provider execution correlation exists. Earlier readiness preflight failure correctly detected the stale server snapshot before this restart.
