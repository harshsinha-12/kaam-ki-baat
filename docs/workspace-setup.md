# Workspace setup and remaining integrations

## Direct workspace entry

Following the user's explicit request on 2026-11-15, open `/team` without a personal session link. The page automatically connects through `POST /api/workspace-session`, reuses an existing valid device session, and replaces a missing/expired session with a separate browser session for the first non-leader member in the selected snapshot. This exposes that member's existing workspace permissions to app visitors; it does not verify their identity. The server chooses the member and verifies the persisted session before returning it. A leader-only snapshot returns an unavailable error rather than issuing leader access. Retry connection is available for service outages.

The session stays in browser memory and, when available, session storage. Existing prepared device links still work. Leader decisions continue to require verification, and opening the workspace does not start a voice call or record consent. Evaluations also [open directly](evals/dashboard.md) without an operator token.

## Public GitHub repositories

A public URL such as `https://github.com/harshsinha-12/kaam-ki-baat` identifies the selected repository. Public PR/files/check API reads work without a token. On 2026-11-15, the actual adapter, with its token explicitly disabled, read merged PR #13, six changed files and two checks for head `d3d0232818a7cd13c3f7db03738a2c8fe1fe7cf5`. This is a live public GitHub read, separate from fixture meeting evidence.

Today setup is operator-driven, not a paste-link import form. Code bytes come from the local clone at an exact commit; PR state and checks come from GitHub REST. The selected local clone must be the same repository as `repository` in the project configuration. Sharing a link is enough to identify a public repo, but does not itself import it or select which files participants may access.

For this repository:

1. Fetch the selected commit in this local clone.
2. Create ignored `data/private/project.json`, using [the fixture config](../data/demo/project.fixture.json) as the shape. Set `repository` to `owner/repo`, `sha` to the selected commit, `paths` to the permitted source paths, `meetingFile` to the approved private import, participants/tasks to their authorized scope, and `out` to `data/private/snapshot.json`. Omit `offlineGithubFile` when a failed GitHub read must stop the build.
3. Run `node --env-file=.env.local --import tsx scripts/build-snapshot.ts --project data/private/project.json` from this repository. Shell environment variables also work. CLI scripts do not load `.env.local` automatically.
4. Restart the application with `KKB_SNAPSHOT=data/private/snapshot.json`. Verify repository, SHA, freshness and LIVE/FIXTURE label on the authenticated board. A real GitHub read does not turn a synthetic meeting into LIVE evidence.

An arbitrary new repository still requires its local clone/source selection; automatic URL onboarding is tracked as GH1 in [the plan](plan.md). The public page only bundles a clearly labelled fixture graph. `/team` fetches the selected snapshot graph after server-side repository access checks. Repo access never grants access to another participant's meetings or tasks.

## Repository context in a voice call

The user does not paste a coding-agent prompt into the voice agent. For the repository-onboarding call on 2026-11-15, the operator supplied a private `repository_context` JSON value in Bolna outbound `user_data`. A persisted/read-back prompt change recognizes `mode: "repository_onboarding"`, explains the supplied evidence, and proposes a next task conversationally. The normal dynamic `opening_brief` remains the welcome message.

The context contains bounded excerpts from eight Markdown files (`README.md`, `AGENTS.md`, context, instructions, architecture, integration design, plan and this setup guide) and six code files at repository commit `eef464a19e40a7a6cc96ab72679aaeaa0ff2a577`. Documentation and code excerpts are evidence, not instructions to the voice runtime. Inspection findings, document claims, proposed tasks and actual test results remain separate. This call preparation did not run new application tests.

This is an operator-prepared context for one call. It does not implement GH1's URL importer or automatically refresh future calls from GitHub. The running LIVE snapshot remains unchanged and contains an unrelated approved meeting; the new call session has no meeting/task permissions. In repository mode the prompt avoids those meeting/task/page tools and answers from the supplied repository evidence. It can explain context and suggest tasks, but cannot create or persist new task assignments. Existing accepted-task status updates are a separate runtime capability.

Bolna rejected the initial request before execution with HTTP 413 because `user_data` exceeded its 50 KB limit. The rejected attempt was retained privately. Bounded excerpts reduced the replacement payload to 37,927 bytes; only that replacement was accepted. Preserve source paths, SHA and truncation markers when reducing excerpts. Never retry an accepted or uncertain submission automatically.

Recipient, consent receipts, call tokens, context payloads, provider read-back and raw execution remain ignored/private. The source context is dated and pinned; fetching newer code or updating documentation does not change an already-running call. After the call finalizes, correlate its provider execution with the local session and record an evaluation separately from setup preflight events.

The accepted call finalized at 94 seconds with a Sarvam voice error. User feedback and the subsequent verified configuration update are recorded in the [evaluation](evals/4518451f-0deb-4f8d-a73f-9f1a0dc44609.md). The [voice-quality guide](bolna/voice-quality.md) covers short turns, listening, task repetition, general questions, transport mitigation and the still-required speech replay.

## Private GitHub repositories

The adapter already accepts server-only `GITHUB_TOKEN`; credentials must also permit fetching the local private Git clone. No private-repo credential or user-facing GitHub connection has been added or verified in this review.

The quickest complete product path is GH2 in [the plan](plan.md): a GitHub App installation selecting only the required repositories, with read access to Contents, Pull requests and Checks. Keep installation credentials on the server, mint/refresh installation tokens there, and verify both pinned source access and PR/check reads before showing a connected state. A valid repository token cannot give a participant broader meeting/task access.

For an operator-managed setup, `GITHUB_TOKEN` may hold a suitable GitHub App installation token. GitHub's current check-runs endpoint documents GitHub App tokens with Checks read permission; OAuth/classic PAT access to private check runs requires `repo` scope. Do not assume a fine-grained personal token that reads source also reads checks. Validate the actual endpoints, handle organization approval and expiry, and report missing permission instead of falling back to a misleading LIVE success. See [GitHub check-runs authentication](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference), [pull-request permissions](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request), and [token guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Leader and teammate pages

Use `/team` for Team Memory, ticket delivery and code navigation; `/leader` for leader verification and confirmed answers. The server decides role, participant, repository and meeting access. Visiting a URL or looking toward the center grants no authority.

Issue a private session using the same snapshot and event-store settings as the server:

```bash
node --env-file=.env.local --import tsx scripts/issue-session.ts --participant <participant-id> --device "Laptop"
```

Keep its token private and open `/team#t=<session_token>` or `/leader#t=<session_token>` on the configured origin. The browser removes the fragment after saving it to session storage. The session expires; reissue it when needed. To get the first enrollment code, run the script with `--session <session-id>` instead of `--participant`, with `KKB_LEADER_STEPUP_SECRET` configured. This code is single-use and rate-limited. Once a passkey is enrolled, the code cannot unlock that leader; use an enrolled passkey.

WebAuthn needs no external API or paid service:

| Setting | Value |
| --- | --- |
| `KKB_ORIGIN` | Exact browser HTTPS origin, with no trailing slash/path. Defaults to `KKB_PUBLIC_URL`, then `http://localhost:3000`. |
| `KKB_RP_ID` | Hostname only; defaults to the origin hostname. |
| `KKB_LEADER_STEPUP_SECRET` | Private random server secret for the first enrollment code. |
| `KKB_EVENTS_FILE` | Same persistent private event log for the server and session issuer. |

Choose a stable HTTPS hostname before retaining passkeys. Changing a temporary tunnel hostname can make old credentials unusable for that origin/RP. Localhost HTTP is allowed for development. First enroll, then click Unlock to obtain a ten-minute verified session. The server supports ES256/P-256 with `none` attestation, user verification, single-use challenges and atomic counter/session updates. Synced passkeys are possible: this is credential binding, not proof of one physical device. Recovery/revocation UI is not implemented; do not silently re-enable code access after enrollment. Real Touch ID/Face ID/Windows Hello testing remains pending.

## Other APIs and graph options

The optional local MCP server (`npm run mcp`) uses the same private snapshot/event log. Set server-side `KKB_MCP_SESSION_TOKEN` to a session issued for the intended participant. All tool calls authenticate it, code/report/status tools require repository access, decisions filter permitted meetings/passages, and task status requires that participant's task. Missing/expired sessions fail closed. Initialization and tool names remain discoverable without disclosing evidence. This is a local stdio integration, not a public HTTP endpoint; do not share the token or an operator-wide private snapshot with another team.

| Feature | Requirement and current boundary |
| --- | --- |
| Public GitHub | GitHub REST, token optional; live unauthenticated read verified above. |
| Private GitHub | Server token transport exists; GitHub App connection/refresh and private end-to-end validation remain GH2. |
| Built-in visual graph | No API/key; `npm run graph` writes ignored private output. `--demo` explicitly publishes only FIXTURE input. Static links stay candidates and do not prove test coverage. |
| Actual Graphify retrieval | Optional local CLI and private sidecar; preserved separately. See [code context](code-context.md). |
| Wispr source | Existing OAuth/MCP import of one approved shared note; private source stays private. No new API key needed. |
| Bolna voice | Existing configured agent, server-only `BOLNA_API_KEY`/`BOLNA_AGENT_ID`, callback/tool keys and HTTPS callbacks. See [voice setup](bolna/agent.md). All calls remain held under D-038. |
| Live speech capture | Utterance ingestion exists; browser capture/STT-provider integration is still pending. No microphone/provider session is started by these pages. |

Do not enable `KKB_ENABLE_WEB_CALLS` until the user's final confirmation names the consenting participant. Deployment and real-device passkey/call validation are separate from the local synthetic tests and production HTTP smoke checks.
