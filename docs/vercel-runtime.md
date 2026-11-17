# Standalone Vercel runtime

The Vercel app needs shared persistent storage for approved evidence, device/call sessions, focus/source updates, conversation state and evaluations. The Mac's absolute paths and local JSONL files are not available to a Vercel function. Copying a local session token does not copy its server-side session.

## Configure and import

1. Connect a permanent, project-owned Upstash Redis database through Vercel Marketplace. Keep its REST URL and token server-only. The runtime accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases. Use a separate database/namespace for previews; previews must not share production sessions or audit writes.
2. Set `KKB_STORAGE_NAMESPACE` to a stable project-specific name. Load the same Redis credentials privately into the migration process. Never put them in `NEXT_PUBLIC_*`, source files, CLI arguments or Git.
3. Before enabling the new deployment, import the explicitly approved local snapshot and audit:

   ```sh
   npm run storage:migrate -- --snapshot /private/snapshot.json --events /private/events.jsonl
   ```

   The importer prints counts, hashes, repository/SHA and the immutable `snapshotKey`, never passages or session tokens. It verifies persisted read-back. Repeating an identical import is safe; a divergent hosted audit is refused. Stop source writers during the cutover. Existing device/call token hashes are preserved; expiry and participant permissions remain enforced.
4. Set `KKB_SNAPSHOT_KEY` to the returned immutable key. Remove Mac-only `KKB_SNAPSHOT`, `KKB_EVENTS_FILE`, `KKB_CODE_GRAPH` and `KKB_EVAL_DIR` overrides from the hosted environment. Set `KKB_PUBLIC_URL` and `KKB_ORIGIN` to the actual HTTPS deployment origin, and `KKB_RP_ID` to its hostname. A passkey registered for a different hostname must be registered again.
5. Retain server-only `KKB_TOOL_KEY`, `KKB_BOARD_KEY`, `KKB_CALLBACK_KEY`, `KKB_LEADER_STEPUP_SECRET` and the authorized Bolna configuration. Browser call creation still requires fresh explicit recording consent. Deploy with `KKB_ENABLE_WEB_CALLS=false` until the existing agent's authenticated function/webhook URLs have been reviewed, changed with authorization, and read back successfully.
6. Deploy the reviewed code to the existing Vercel project. `/api/health` must report a loaded snapshot with the intended repository/SHA and `hosted-redis` persistence. Verify an authenticated `/api/zones/me` from a fresh instance, unauthorized denial, source selection/read-back, and evaluation persistence. Do not place a verification call without applicable participant consent.

`npm run session:issue` and `npm run call:token` use hosted storage when configured. They issue credentials; they do not place calls. On the user's explicit request, `/team` now connects without a prepared link: `POST /api/workspace-session` reuses a valid device session or issues a separate browser session for the first non-leader member of the snapshot. App visitors share that member's existing workspace scope; their personal identity is not verified. Leader verification and explicit recording/call consent remain required. Existing private `/team#t=…` links are still accepted for separately issued sessions.

## Durability and limits

The hosted event store uses Redis Lua compare-and-append for cross-instance version/idempotency guards. Provider-request leases are shared, expire after a killed request and prevent overlapping starts. The one-use spatial call endpoint records its reservation before contacting the provider and refuses a reused token even after a failed/ambiguous request. Project-guide retries require another explicit start.

Conversation cards and communication ledgers are restored from the shared audit and bound to the snapshot repository/SHA. Evaluation bundles are persisted/read back in Redis; provider refresh remains a read-only operation. Existing locally saved evaluations/review overrides can be imported separately with `--eval-dir /private/call-evals`.

Local development continues using JSONL and private files when Redis is unset. On Vercel, missing hosted storage fails closed; it does not fall back to a fixture, ephemeral filesystem, or anonymous private-source access. Health reports an unavailable state without exposing filesystem paths.

The event adapter keeps an encoded prefix in each warm process and atomically reads only the appended suffix from the primary on every read. A new instance still loads the complete audit; a shorter log clears its cached prefix. Reads during an outage fail rather than using stale authentication or task state. Guarded writes retain the existing atomic length comparison, and successful writes are not added to the cache until a subsequent persisted read. Runtime store reuse keeps evaluation refreshes on the same warm reader. Event objects are parsed afresh so callers cannot mutate the cached history.

The evaluation reader checks the current value's SHA-1 digest on the primary and downloads the JSON only when it changes. This digest is a change token, not an authorization mechanism. Same-length edits, deletions and changes from another instance are detected without a TTL delay; provider read-back after writes remains uncached. Background board, workspace, source-viewer, focus and leader polling pauses while the document is hidden. Interval-based pollers also avoid overlapping their own pending requests.

These changes reduce repeated payload transfer; they do not remove command charges, full reads on cold starts, CPU costs of replaying history, or the need to monitor usage. Large histories still need indexed projections/retention and capacity monitoring. Do not rewrite/replace a live append-only event list; for an administrative restore, stop writers and restart application instances to discard all cached prefixes. Enable database backups and choose a permanent plan appropriate to the data. A temporary agent database with an expiry is not production hosting.

## Restoring a bandwidth-suspended Upstash database

For this Vercel-billed database, open the Vercel team's **Integrations**, select **Manage** beside Upstash, then find **Installed Products → kaam-ki-baat-runtime → Settings → Change Configuration**. Select **Pay as You Go**, review the displayed prices and complete payment details yourself. Deleting keys cannot reverse bandwidth already consumed during the month. The existing credentials and namespace can stay in place when upgrading the same database.

Upstash publishes a command rate of $0.20/100K, with regional write replication potentially increasing billed commands. Its current pricing page describes 200 GB/month of included Pay as You Go bandwidth and $0.03/GB above that. Check the Vercel checkout for the applicable Marketplace offer. If a monthly budget control is available, start with a small cap such as $5 and monitor it; reaching the cap can limit database availability. Prod Pack and Enterprise are separate options, not prerequisites for this fix. See [pricing and budget behavior](https://upstash.com/pricing/redis).

After payment completes, verify a successful database read and `/api/health` before claiming restoration. The bandwidth fix is a separate code release and takes effect only after the reviewed change is deployed. No environment migration is needed to retain the current Upstash instance.

Synthetic adapter/concurrency tests establish application behavior. They do not prove a database was provisioned, a deployment succeeded, provider callbacks were repointed, or browser audio works. Record those outcomes separately in `docs/plan.md`.

## Verified environment setup — 2026-11-15

| Environment | Storage namespace | Browser calling |
| --- | --- | --- |
| Vercel Production | `kaam-ki-baat-production` | Enabled; approved agent callbacks use the canonical Vercel origin |
| Root `.env.local` / managed localhost | `kaam-ki-baat-production` | Enabled; intentionally mirrors the production workspace |
| Vercel Preview | `kaam-ki-baat-preview` | Disabled; use a separately authorized agent/routing setup before enabling |
| Vercel Development | `kaam-ki-baat-development` | Disabled by default |

All targets have their REST storage credentials, immutable snapshot key, server authentication/Bolna keys and site metadata setting. Source snapshot and initial audit/evaluations were imported/read back into the isolated namespaces. Production origin/RP match `kaam-ki-baat-xi.vercel.app`; Development targets localhost. Preview origin/RP overrides are blank: configure the exact preview origin before a leader passkey ceremony. There is no claim of a physical passkey check on previews.

Only `NEXT_PUBLIC_SITE_URL` is public configuration. Redis credentials, Bolna credentials and operator/server keys have no public prefix. `KKB_EVAL_DIR`, `KKB_SNAPSHOT` and `KKB_EVENTS_FILE` are not required on Vercel. Root legacy local paths were preserved and are ignored by the hosted adapter while Redis is configured. Local settings are backed up privately; no credentials or source passages are committed.

Following the user's explicit request on 2026-11-15, `/evals` and `/api/evals` open directly without a token or prepared link. Anyone who can reach the app can read call evaluations, transcripts and captured context. Provider credentials stay server-only, and responses retain no-store caching and credential/phone/recording-URL redaction. Historical operator links are no longer needed for evaluations; `KKB_BOARD_KEY` still protects the separate evidence-board APIs.
