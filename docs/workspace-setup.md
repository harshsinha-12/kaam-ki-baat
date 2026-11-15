# Workspace setup and remaining integrations

## Public GitHub repositories

A public URL such as `https://github.com/harshsinha-12/kaam-ki-baat` identifies the selected repository. Public PR/files/check API reads work without a token. On 2026-11-15, the actual adapter, with its token explicitly disabled, read merged PR #13, six changed files and two checks for head `d3d0232818a7cd13c3f7db03738a2c8fe1fe7cf5`. This is a live public GitHub read, separate from fixture meeting evidence.

Today setup is operator-driven, not a paste-link import form. Code bytes come from the local clone at an exact commit; PR state and checks come from GitHub REST. The selected local clone must be the same repository as `repository` in the project configuration. Sharing a link is enough to identify a public repo, but does not itself import it or select which files participants may access.

For this repository:

1. Fetch the selected commit in this local clone.
2. Create ignored `data/private/project.json`, using [the fixture config](../data/demo/project.fixture.json) as the shape. Set `repository` to `owner/repo`, `sha` to the selected commit, `paths` to the permitted source paths, `meetingFile` to the approved private import, participants/tasks to their authorized scope, and `out` to `data/private/snapshot.json`. Omit `offlineGithubFile` when a failed GitHub read must stop the build.
3. Run `node --env-file=.env.local --import tsx scripts/build-snapshot.ts --project data/private/project.json` from this repository. Shell environment variables also work. CLI scripts do not load `.env.local` automatically.
4. Restart the application with `KKB_SNAPSHOT=data/private/snapshot.json`. Verify repository, SHA, freshness and LIVE/FIXTURE label on the authenticated board. A real GitHub read does not turn a synthetic meeting into LIVE evidence.

An arbitrary new repository still requires its local clone/source selection; automatic URL onboarding is tracked as GH1 in [the plan](plan.md). The public page only bundles a clearly labelled fixture graph. `/team` fetches the selected snapshot graph after server-side repository access checks. Repo access never grants access to another participant's meetings or tasks.

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
