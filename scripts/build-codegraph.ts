// Build the code graph from the evidence snapshot (files at the pinned SHA).
//   npm run graph   -> data/demo/codegraph.json + docs/codegraph/GRAPH_REPORT.md
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCodeGraph, graphReport, queryGraph } from "../lib/codegraph/graph";
import { loadSnapshot } from "../lib/evidence/load";

const s = loadSnapshot();
const g = buildCodeGraph(s.repository, s.pinnedSha, s.files);
writeFileSync("data/demo/codegraph.json", JSON.stringify(g));
mkdirSync("docs/codegraph", { recursive: true });
writeFileSync("docs/codegraph/GRAPH_REPORT.md", graphReport(g));
// Real answers for the landing page demo (computed, not hand-written).
const DEMO = ["where do we read back before saying saved", "leader step up verification", "which code dedupes bolna callbacks", "kahan hai head turn dwell hysteresis", "passkey signature counter cloned key"];
writeFileSync("data/demo/codegraph.demo.json", JSON.stringify(DEMO.map((q) => { const a = queryGraph(g, q, s.files); return { q, seed: a.seed, nodes: a.subgraph.nodes, explanation: a.explanation }; })));
console.log(`graph @ ${s.pinnedSha.slice(0, 7)}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${g.communities.length} communities`);
