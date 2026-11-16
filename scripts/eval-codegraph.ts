// Retrieval eval over THIS repo at the pinned SHA. Compares four methods on the
// same labelled questions (most are plain-language, without the function name):
//   grep      — files ranked by raw word counts (what an agent does without help)
//   bm25      — keyword ranking over symbols
//   graph-v1  — the original explainable seed finder (queryGraph)
//   semantic  — BM25 + concept expansion + graph propagation (lib/codegraph/search.ts)
// Metrics: symbol hit@1, hit@3, MRR@8 and file hit@1 (grep can only do files).
//   npm run graph:eval            prints the table
//   npm run graph:eval -- --write also writes docs/codegraph/EVAL.md
import { writeFileSync } from "node:fs";
import { getCodeGraph } from "../lib/codegraph/load";
import { queryGraph } from "../lib/codegraph/graph";
import { buildSearchIndex, grepFiles, search } from "../lib/codegraph/search";
import { loadSnapshot } from "../lib/evidence/load";
import { buildCodeGraph } from "../lib/codegraph/graph";
import { codeFilesAt, codeRefArg } from "./code-files";

import { CASES, HELD_OUT } from "./eval-cases";
export { CASES, HELD_OUT };

const s = loadSnapshot();
// --code-ref <ref>: evaluate against the code at that commit (same as `graph -- --code-ref`).
const ref = codeRefArg();
if (ref) { const c = codeFilesAt(ref); s.pinnedSha = c.sha; s.files = c.files; }
const g = ref ? buildCodeGraph(s.repository, s.pinnedSha, s.files) : getCodeGraph(s);
const idx = buildSearchIndex(g, s.files);
const fileOf = new Map(g.nodes.map((n) => [n.label, n.path]));
type Row = { hit1: number; hit3: number; mrr: number; file1: number };
const methods: Record<string, (q: string) => { syms: string[]; files: string[] }> = {
  grep: (q) => ({ syms: [], files: grepFiles(s.files, q) }),
  bm25: (q) => { const h = search(idx, g, q, "bm25"); return { syms: h.map((x) => x.label), files: h.map((x) => x.path) }; },
  "graph-v1": (q) => { const a = queryGraph(g, q, s.files); return { syms: a.seed ? [a.seed.label] : [], files: a.seed ? [a.seed.path] : [] }; },
  semantic: (q) => { const h = search(idx, g, q, "semantic"); return { syms: h.map((x) => x.label), files: h.map((x) => x.path) }; },
};
const results: Record<string, Row> = {};
const misses: Record<string, string[]> = {};
// A question only counts if its answer exists at this commit.
function evaluate(cases: [string, string[]][]) {
  const present = cases.filter(([, want]) => want.some((w) => fileOf.has(w)));
  const absent = cases.length - present.length;
  const results: Record<string, Row> = {};
  const misses: Record<string, string[]> = {};
  const top: Record<string, Record<string, string>> = {};
  for (const [name, fn] of Object.entries(methods)) {
    const r: Row = { hit1: 0, hit3: 0, mrr: 0, file1: 0 }; misses[name] = []; top[name] = {};
    for (const [q, want] of present) {
      const { syms, files } = fn(q);
      const wantFiles = new Set(want.map((w) => fileOf.get(w)));
      const rank = syms.findIndex((x) => want.includes(x));
      top[name][q] = name === "grep" ? (files[0] ?? "—") : syms[0] ? `${syms[0]}${rank === 0 ? " ✓" : rank > 0 ? ` (✓ at ${rank + 1})` : ""}` : "—";
      if (rank === 0) r.hit1++;
      if (rank >= 0 && rank < 3) r.hit3++;
      if (rank >= 0) r.mrr += 1 / (rank + 1);
      if (files[0] && wantFiles.has(files[0])) r.file1++; else misses[name].push(q);
    }
    results[name] = r;
  }
  return { present, absent, results, misses, top };
}
function table(e: ReturnType<typeof evaluate>) {
  const n = e.present.length;
  const pct = (x: number) => `${Math.round((x / n) * 100)}%`;
  return [
    "| Method | symbol hit@1 | symbol hit@3 | MRR@8 | file hit@1 |",
    "| --- | --- | --- | --- | --- |",
    ...Object.entries(e.results).map(([k, r]) => `| ${k} | ${k === "grep" ? "—" : pct(r.hit1)} | ${k === "grep" ? "—" : pct(r.hit3)} | ${k === "grep" ? "—" : (r.mrr / n).toFixed(2)} | ${pct(r.file1)} |`),
  ];
}
const main = evaluate(CASES);
const held = evaluate(HELD_OUT);
const source = ref ? `code from git at ${ref}` : `${s.label} snapshot`;
const lines = [
  `# Code search eval — ${s.repository} @ ${s.pinnedSha.slice(0, 7)} (${source})`,
  "",
  "Can you find the right function from a plain-language question? Four methods, same questions, same commit.",
  "",
  "- **grep** — files ranked by raw word counts: what an agent does with no index.",
  "- **bm25** — classic keyword ranking over every function, class and file.",
  "- **graph-v1** — our first explainable seed finder (one answer).",
  "- **semantic** — BM25 + concept expansion (\"fingerprint\" → passkey/webauthn) + one hop of graph propagation + kind/layer priors. Lexical, no embeddings: it runs offline in the browser.",
  "",
  `## Development set — ${main.present.length} questions${main.absent ? ` (${main.absent} skipped: answer not in this commit)` : ""}`,
  "",
  ...table(main),
  "",
  `## Held-out set — ${held.present.length} questions written after tuning, never used to tune`,
  "",
  ...table(held),
  "",
  "grep ranks files only (it can't name a function). graph-v1 returns one seed, so its hit@3 equals hit@1.",
  "",
  "## Question by question (top result)",
  "",
  "| Set | Question | grep (top file) | bm25 | semantic |",
  "| --- | --- | --- | --- | --- |",
  ...[["dev", main] as const, ["held-out", held] as const].flatMap(([set, e]) => e.present.map(([q]) => `| ${set} | ${q} | ${e.top.grep[q].split("/").slice(-2).join("/")} | ${e.top.bm25[q]} | ${e.top.semantic[q]} |`)),
  "",
  "## Where semantic still misses (file hit@1)",
  ...[...main.misses.semantic, ...held.misses.semantic].map((q) => `- ${q}`),
  "",
  "Written by the team that built the code, so treat these as a regression guard, not a public benchmark. Reproduce: `npm run graph:eval -- --code-ref HEAD`.",
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) writeFileSync("docs/codegraph/EVAL.md", lines.join("\n") + "\n");
