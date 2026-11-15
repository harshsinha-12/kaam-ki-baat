# Code context for knowledge transfer

The optional Graphify path links an existing meeting task to source symbols and nearby dependencies. A task's `searchTerms` and the caller's question seed the graph. Code Scout returns the best source location and a bounded set of callers, callees or imports. Fix Navigator supplies a test pointer; Evidence Verifier still determines PR/check status independently. Graph relationships never establish ownership or completion.

## Build and query

Install the official **`graphifyy`** package (double y), which provides the `graphify` command. Python 3.10+ is required. This integration was exercised with **0.9.100**. Graphify is a development-time tool; it is not a Next.js dependency or a service invoked during calls.

```bash
uv tool install graphifyy==0.9.100

# An approved snapshot must already exist. This does not import a meeting.
npm run context:build -- --snapshot data/private/snapshot.json

# Developer query: same Code Scout implementation used by the runtime.
npm run context:code -- --snapshot data/private/snapshot.json \
  --graph data/private/code-graph.json --task <task-id> \
  --question "persistVerifiedUpdate"
```

For the committed synthetic meeting fixture:

```bash
npm run context:build -- --snapshot data/demo/snapshot.fixture.json \
  --out data/private/code-graph.fixture.json
npm run context:code -- --snapshot data/demo/snapshot.fixture.json \
  --graph data/private/code-graph.fixture.json --question "persistVerifiedUpdate"
```

Set `KKB_CODE_GRAPH=data/private/code-graph.json` in ignored `.env.local` and restart the server to enable it for authenticated phone/browser tools. For the fixture use `code-graph.fixture.json` with that fixture snapshot. Set `GRAPHIFY_BIN` to an absolute executable path if the CLI is outside `PATH`. CLI scripts take environment variables from the shell; they do not load `.env.local` automatically. Removing `KKB_CODE_GRAPH` restores keyword retrieval.

The developer query is a local repository tool, not a public identity or authorization endpoint. It emits code locations and graph provenance, without meeting passages. The telephone tools retain their existing caller/task authorization.

## Scope and freshness

`context:build` verifies code bytes against the snapshot's commit in the local Git object store, copies only its selected JavaScript/TypeScript files into a temporary directory, then runs `graphify extract . --code-only --no-cluster --max-workers 1`. It does not scan the working tree or pass meeting documents, environment files or runtime events to Graphify. Temporary sources are removed after success or failure. The normalized graph is written atomically with private file permissions; a failed extraction preserves the previous graph.

The importer consumes the documented NetworkX node-link subset: `nodes`, `links` (or compatibility `edges`), `source_file`, `source_location`, `relation` and `confidence`. Absolute paths must be beneath the temporary extraction root. Missing files, document nodes, unresolved external references and invalid ranges are discarded. The artifact records repository, commit, file-content hashes, build timestamp and producer version.

At load time the runtime validates the graph against the selected snapshot. A repository/SHA/content mismatch, missing sidecar or malformed graph causes keyword fallback. A graph query with no match also falls back. Loaded snapshots are immutable; rebuild the graph and restart when replacing the snapshot. A new snapshot receives a new in-memory index.

Queries use an inverted label/path index, up to eight seeds and one hop from the best seed. Expansion and output are capped; ordinary runtime queries return at most three findings. Source excerpts and permalinks come from the snapshot. Graph labels are hints, and a symbol is shown only when it appears on the cited source line. Related findings carry `retrieval.via` with direction and `EXTRACTED`/`INFERRED` confidence, and stay `candidate`, including when their files appear in a PR. No graph inference changes task assignment, PR, checks or completion state.

Graph building happens before a call and index compilation happens once per loaded snapshot. Subsequent successful graph queries avoid scanning every source line. Keyword fallback and Fix Navigator's test lookup may still scan files. No end-to-end voice latency improvement has been measured.

Generated graphs stay under ignored `data/private/`; raw `graphify-out/` is also ignored. No global graph, database, cloud account, assistant hook or MCP registration is required.

## Evidence and sources

On 2026-11-15, Graphify 0.9.100 ran locally against the committed fixture snapshot at `63317bdea64bc95765ba00467fcf56f10c73ec85`: **147 nodes, 330 edges, 27 code files**. Queries located `persistVerifiedUpdate`, its helper `withTimeout`, its caller `dispatch` and `parseTaskUpdate`, with exact SHA-pinned excerpts. The meeting remains **FIXTURE**. This verifies local extraction/import/retrieval, not an approved meeting import or a provider call.

Eight regression tests in [graphify-context.test.ts](../tests/graphify-context.test.ts) cover dependency discovery without a keyword hit, relationship direction/confidence, stale and out-of-scope fallback, bounded output, export compatibility, private sidecar loading, authenticated task-tool delivery and device Code Navigator provenance/access checks. Current aggregate checks are recorded in [the plan](plan.md).

Primary references checked on 2026-11-15:

- [Official repository](https://github.com/Graphify-Labs/graphify): package identity and local code parsing.
- [CLI reference](https://docs.graphify.com/open-source/configuration/cli): code-only extraction, query flags and version 0.9.100.
- [Graph files and outputs](https://docs.graphify.com/concepts/outputs): NetworkX JSON, source references and artifact access controls.
- [Extraction architecture](https://docs.graphify.com/concepts/architecture): inferred relationships and semantic extraction boundaries.
