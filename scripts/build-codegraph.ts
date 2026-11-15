// Build the code graph from the evidence snapshot (files at the pinned SHA).
//   npm run graph          -> ignored private output (safe with LIVE sources)
//   npm run graph -- --demo -> tracked examples, FIXTURE sources only
//   npm run graph -- --demo --code-ref HEAD -> same, with the code at HEAD
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCodeGraph, graphReport, queryGraph } from "../lib/codegraph/graph";
import { buildSearchIndex } from "../lib/codegraph/search";
import { loadSnapshot } from "../lib/evidence/load";
import { codeFilesAt, codeRefArg } from "./code-files";

const s = loadSnapshot();
const demo = process.argv.includes("--demo");
if (demo && s.label !== "FIXTURE") throw new Error("Public graph examples require a FIXTURE snapshot; LIVE graph output stays private");
const output = demo ? "data/demo" : "data/private/codegraph";
const reportDirectory = demo ? "docs/codegraph" : output;
mkdirSync(output, { recursive: true });
mkdirSync(reportDirectory, { recursive: true });
// --code-ref <ref>: graph the repo's code at that commit (code only, from git).
const ref = codeRefArg();
if (ref) { const c = codeFilesAt(ref); s.pinnedSha = c.sha; s.files = c.files; }
const g = buildCodeGraph(s.repository, s.pinnedSha, s.files);
writeFileSync(`${output}/codegraph.json`, JSON.stringify(g), { mode: 0o600 });
writeFileSync(`${reportDirectory}/GRAPH_REPORT.md`, graphReport(g), { mode: 0o600 });
// Real answers for the landing page demo (computed, not hand-written).
const DEMO = ["where do we read back before saying saved", "leader step up verification", "which code dedupes bolna callbacks", "kahan hai head turn dwell hysteresis", "passkey signature counter cloned key"];
writeFileSync(`${output}/codegraph.demo.json`, JSON.stringify(DEMO.map((q) => { const a = queryGraph(g, q, s.files); return { q, seed: a.seed, nodes: a.subgraph.nodes, explanation: a.explanation }; })), { mode: 0o600 });
writeFileSync(`${output}/codesearch.json`, JSON.stringify(buildSearchIndex(g, s.files)), { mode: 0o600 });
console.log(`graph @ ${s.pinnedSha.slice(0, 7)}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${g.communities.length} communities`);
