# MCP integration setup

Checked on 2026-11-15. MCP registration, authentication, live tool discovery, and application integration are separate checkpoints.

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
- No agent has been created or changed, and no telephone call has been placed.

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
