# Audit — public /team and /graph, 2026-11-15

## Evidence checked

- Public URL: https://kaam-ki-baat-xi.vercel.app/team and https://kaam-ki-baat-xi.vercel.app/graph
- Deployed `/api/deployment-info` reported repository `harshsinha-12/kaam-ki-baat`, branch `main`, SHA `cdcc9101fa2b1c82dbaab263339cfb0d6ebead37` at observation time.
- At that deployed SHA, public `/api/health` reported `snapshot.loaded=false` and a missing **developer-machine absolute path**. This is a configuration/runtime failure, NOT simply an empty Wispr account.
- A **newer main commit** added hosted Redis runtime loading and sanitizes public health errors. Whether the current public deployment has caught up and whether the Redis env/snapshot is present must be re-verified. This PR does not repair missing credentials.
- The unauthenticated `/team` page renders a branded workspace and checks for a personal session token; actual team query, leader approval, web call and camera states were not authenticated or visually exercised in this audit.

## Code-graph review

- Public `/graph` statically imports `data/demo/codegraph.json` and `data/demo/codesearch.json`. Both are pinned to SHA `317a34838683e20116940af7a2c5fc4cfe1d9771`, which differs from observed public deployment SHA `cdcc9101...`.
- Public artifact at that historical SHA: **454 nodes, 1,277 edges and 18 communities** across 128 distinct referenced code paths. These are not the counts for current HEAD.
- Built-in `lib/codegraph/graph.ts` uses deterministic static import/declaration heuristics and label propagation. It does not parse every programming language, every nested function or prove that a test exercises the referenced behavior.
- `lib/codegraph/search.ts` has keyword/BM25/lexical-semantic search; no embeddings. In the repo's own held-out 12-query evaluation, semantic symbol hit@1 was **8%** and hit@3 **33%** versus 64%/93% on the tuned 28-question development set. These are team-defined evals, not an independent external benchmark.
- Optional **Graphify** uses `graphifyy` CLI to import a private, code-only NetworkX graph from the snapshot's exact Git bytes. `lib/evidence/code-graph.ts` validates SHA, repository, paths and hashes; invalid artifacts fall back to keyword retrieval. Graphify is NOT required for the `/graph` visualization, is not an MCP provider, and is not automatically running in Bolna or Vercel.
- Authenticated `/api/zones/code_graph_query` and `/api/project` build a separate graph from the server's approved loaded snapshot. They can have different coverage/freshness from the public bundled `/graph` and need an explicit LIVE/FIXTURE badge.

## Top priorities

1. **P0 readiness:** get public `/api/health` to report loaded, accessible, consent-approved evidence and durable hosted storage. Verify `KKB_SNAPSHOT`/hosted storage configuration via Vercel project settings without exposing secrets. No claims of working meetings until verified.
2. **P0 source separation:** use the explicitly synthetic scenario in `docs/demo/QA_MEETING_SCENARIO.md` only as fixture/Scratchpad sample; do not mark it LIVE Wispr Notetaker.
3. **P1 graph freshness:** public graph must label older snapshots (addressed in this PR). A future build pipeline should regenerate the graph from a reproducible, approved current code snapshot and report exactly which files/languages/symbols are indexed.
4. **P1 retrieval quality:** add held-out tests for Hinglish, async flows, changed file, test association, and tasks that cannot be linked. Keep graph edges as candidates until source-backed.
5. **P1 voice end-to-end:** real consenting Bolna call must retrieve one authorized source, provide a pinned code pointer, and complete an authenticated write with read-back; measure provider run ID, outcome, latency and source version.

## Unverified

Full browser camera/mic/animation interaction, any active Wispr MCP read by the live deployed backend, actual browser voice-tool roundtrip, native AirPods head-motion samples and leader escalation on this public deployment were not observed. These remain test gates, not completed outcomes.
