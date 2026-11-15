// Build the code graph from the evidence snapshot (files at the pinned SHA).
//   npm run graph   -> data/demo/codegraph.json + docs/codegraph/GRAPH_REPORT.md
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCodeGraph, graphReport } from "../lib/codegraph/graph";
import { loadSnapshot } from "../lib/evidence/load";

const s = loadSnapshot();
const g = buildCodeGraph(s.repository, s.pinnedSha, s.files);
writeFileSync("data/demo/codegraph.json", JSON.stringify(g));
mkdirSync("docs/codegraph", { recursive: true });
writeFileSync("docs/codegraph/GRAPH_REPORT.md", graphReport(g));
console.log(`graph @ ${s.pinnedSha.slice(0, 7)}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${g.communities.length} communities`);
