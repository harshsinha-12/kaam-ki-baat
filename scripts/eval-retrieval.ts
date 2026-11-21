// Code search eval with localization metrics used in recent repository-level
// benchmarks (LocBench / RepoNav: Acc@k and Recall@k at file and function level;
// OrcaLoca, ICML 2025: function match rate), plus MRR, nDCG@10, a paraphrase
// stress set, bootstrap 95% intervals and per-query latency.
//   npm run eval:retrieval              prints the report
//   npm run eval:retrieval -- --write   also writes docs/evals/code-search.json
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildCodeGraph } from "../lib/codegraph/graph";
import { getCodeGraph } from "../lib/codegraph/load";
import { queryGraph } from "../lib/codegraph/graph";
import { buildSearchIndex, expand, grepFiles, search, tokenize } from "../lib/codegraph/search";
import { highlightSymbol } from "../lib/codegraph/highlight";
import { loadSnapshot } from "../lib/evidence/load";
import { codeFilesAt, codeRefArg } from "./code-files";
import { CASES, HELD_OUT, TEST_2026_11 } from "./eval-cases";

// STRESS: colloquial, Hinglish and indirect phrasings written for this eval and
// never used for tuning. They ask for the same functions in the way people talk.
export const STRESS: [string, string[]][] = [
  ["saved bolne se pehle check kahan hota hai", ["persistVerifiedUpdate", "resolveTicket"]],
  ["lead ka fingerprint wala login", ["assertPasskey", "stepUp", "registerPasskey"]],
  ["agar call ka status do baar aaye toh kya hota hai", ["recordExecutionCallback"]],
  ["sir ghumane se kaunsa agent chunte hain", ["step", "recordFocus", "latestActivatedZone"]],
  ["mic band kar diya toh recording rukti hai kya", ["setConsent", "ingestUtterance"]],
  ["purane commit pe CI pass hua tha, woh pakadta kaun hai", ["reconcileTask", "evidenceVerifier"]],
  ["umm the thing that cleans up uh filler words", ["understand", "finalIntent"]],
  ["who gets to see the boss's question list", ["leaderInbox", "zoneAccess"]],
  ["one time token for a phone call", ["issueCallSession"]],
  ["where do team decisions get answered from", ["askTeamMemory", "currentDecisions"]],
  ["github se PR aur checks padhne wala code", ["githubClient"]],
  ["log that only ever appends", ["EventStore"]],
  ["kaunsa code decide karta hai ki task done bol sakte hain", ["evidenceVerifier", "reconcileTask"]],
  ["doubt ko lead tak bhejna", ["createTicket"]],
];

const K = 10;
const s = loadSnapshot();
const ref = codeRefArg();
if (ref) { const c = codeFilesAt(ref); s.pinnedSha = c.sha; s.files = c.files; }
const g = ref ? buildCodeGraph(s.repository, s.pinnedSha, s.files) : getCodeGraph(s);
const idx = buildSearchIndex(g, s.files);
const fileOf = new Map(g.nodes.map((n) => [n.label, n.path]));

type Ranked = { syms: string[]; files: string[] };
const METHODS: Record<string, (q: string) => Ranked> = {
  grep: (q) => ({ syms: [], files: grepFiles(s.files, q, K) }),
  bm25: (q) => { const h = search(idx, g, q, "bm25", K); return { syms: h.map((x) => x.label), files: h.map((x) => x.path) }; },
  "graph-v1": (q) => { const a = queryGraph(g, q, s.files); return { syms: a.seed ? [a.seed.label] : [], files: a.seed ? [a.seed.path] : [] }; },
  semantic: (q) => { const h = search(idx, g, q, "semantic", K); return { syms: h.map((x) => x.label), files: h.map((x) => x.path) }; },
};

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
function scoreOne(r: Ranked, want: string[]) {
  const wantFiles = new Set(want.map((w) => fileOf.get(w)).filter(Boolean) as string[]);
  const syms = r.syms.slice(0, K), files = uniq(r.files).slice(0, K);
  const rank = syms.findIndex((x) => want.includes(x));
  const frank = files.findIndex((f) => wantFiles.has(f));
  // nDCG@10 with binary relevance; ideal = all acceptable golds present at the top
  const rel = syms.map((x) => (want.includes(x) ? 1 : 0));
  const dcg = rel.reduce<number>((a, r, i) => a + r / Math.log2(i + 2), 0);
  const ideal = want.filter((w) => fileOf.has(w)).slice(0, K).reduce((a, _, i) => a + 1 / Math.log2(i + 2), 0) || 1;
  const recall = want.filter((w) => syms.includes(w)).length / Math.max(1, want.filter((w) => fileOf.has(w)).length);
  return {
    fn1: +(rank === 0), fn5: +(rank >= 0 && rank < 5), fnRec10: recall, mrr: rank >= 0 ? 1 / (rank + 1) : 0, ndcg: dcg / ideal,
    file1: +(frank === 0), file5: +(frank >= 0 && frank < 5),
  };
}
type Scores = ReturnType<typeof scoreOne>;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
// Deterministic bootstrap (fixed LCG seed) so the report is reproducible.
function ci95(xs: number[], n = 2000) {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ms: number[] = [];
  for (let i = 0; i < n; i++) ms.push(mean(xs.map(() => xs[Math.floor(rnd() * xs.length)])));
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(n * .025)], ms[Math.floor(n * .975)]] as const;
}
function run(cases: [string, string[]][]) {
  const present = cases.filter(([, want]) => want.some((w) => fileOf.has(w)));
  const out: Record<string, { per: Scores[]; ms: number[]; top: string[] }> = {};
  for (const [name, fn] of Object.entries(METHODS)) {
    out[name] = { per: [], ms: [], top: [] };
    for (const [q, want] of present) {
      const t0 = performance.now(); const r = fn(q); out[name].ms.push(performance.now() - t0);
      out[name].per.push(scoreOne(r, want)); out[name].top.push(r.syms[0] ?? r.files[0] ?? "");
    }
  }
  return { n: present.length, skipped: cases.length - present.length, out, questions: present.map(([q]) => q) };
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
function table(title: string, r: ReturnType<typeof run>) {
  const rows = Object.entries(r.out).map(([m, v]) => {
    const f = (k: keyof Scores) => mean(v.per.map((p) => p[k]));
    const sym = m !== "grep";
    const [lo, hi] = ci95(v.per.map((p) => p.fn5));
    return `| ${m} | ${sym ? pct(f("fn1")) : "n/a"} | ${sym ? `${pct(f("fn5"))} (${pct(lo)}–${pct(hi)})` : "n/a"} | ${sym ? pct(f("fnRec10")) : "n/a"} | ${sym ? f("mrr").toFixed(2) : "n/a"} | ${sym ? f("ndcg").toFixed(2) : "n/a"} | ${pct(f("file1"))} | ${pct(f("file5"))} | ${mean(v.ms).toFixed(1)} ms |`;
  });
  return [`### ${title} (${r.n} questions${r.skipped ? `, ${r.skipped} skipped: answer not at this commit` : ""})`, "",
    "| Method | Fn Acc@1 | Fn Acc@5 (95% CI) | Fn Rec@10 | MRR@10 | nDCG@10 | File Acc@1 | File Acc@5 | Latency |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, ""];
}
const dev = run(CASES), held = run(HELD_OUT), stress = run(STRESS), test = run(TEST_2026_11);
// Highlight quality: when the top answer IS the right function, does the box on
// screen show why? Old behaviour boxed the declaration and the two lines under it.
function highlightEval(sets: [string, string[]][][]) {
  const rows: { anchor: { why: number; lines: number; prec: number }; precise: { why: number; lines: number; prec: number } }[] = [];
  for (const cases of sets) for (const [q, want] of cases) {
    const h = search(idx, g, q, "semantic", 1)[0];
    if (!h || !want.includes(h.label) || h.kind === "file" || h.kind === "test") continue;
    const file = s.files.find((f) => f.path === h.path); if (!file) continue;
    const L = file.content.split("\n");
    const strict = new Set(tokenize(q)), loose = new Set(expand(tokenize(q)).map((x) => x.term));
    const measure = (marks: { start: number; end: number }[]) => {
      const ns = [...new Set(marks.flatMap((m) => Array.from({ length: m.end - m.start + 1 }, (_, i) => m.start + i)))];
      const hits = (n: number, set: Set<string>) => tokenize(L[n - 1] ?? "").some((t) => set.has(t));
      return { why: +ns.some((n) => n !== h.line && hits(n, strict)), lines: ns.length, prec: ns.filter((n) => n === h.line || hits(n, loose)).length / Math.max(1, ns.length) };
    };
    rows.push({ anchor: measure([{ start: h.line, end: Math.min(L.length, h.line + 2) }]), precise: measure(highlightSymbol(L, h.line, q)) });
  }
  const m = (k: "anchor" | "precise", f: "why" | "lines" | "prec") => mean(rows.map((r) => r[k][f]));
  return { n: rows.length, lines: [
    `### Highlight quality (${rows.length} questions where the top answer is the right function, all sets)`, "",
    "| Highlight | Shows a line with the question's own words | Lines to read | Highlighted lines that are evidence |", "| --- | --- | --- | --- |",
    `| declaration + 2 lines (before) | ${pct(m("anchor", "why"))} | ${m("anchor", "lines").toFixed(1)} | ${pct(m("anchor", "prec"))} |`,
    `| signature + matching body lines (now) | ${pct(m("precise", "why"))} | ${m("precise", "lines").toFixed(1)} | ${pct(m("precise", "prec"))} |`, ""] };
}
const hl = highlightEval([CASES, HELD_OUT, STRESS, TEST_2026_11]);
const lines = [
  `## Code search (Code Navigator) · ${s.repository} @ ${s.pinnedSha.slice(0, 7)}`, "",
  "Can it name the right function from a plain-language question? Metrics follow repository-level localization benchmarks: accuracy and recall at k for functions and files, MRR and nDCG@10. Intervals are bootstrap 95% over questions.", "",
  ...table("Development set", dev), ...table("Held-out set, written after tuning", held), ...table("Stress set: Hinglish and colloquial paraphrases", stress), ...table("Fresh test set (2026-11-16), written before tuning and never used to tune", test),
  "grep ranks files only; graph-v1 returns one seed, so its Acc@5 equals Acc@1.", "",
  ...hl.lines,
];
console.log(lines.join("\n"));
if (process.argv.includes("--write")) {
  mkdirSync("docs/evals", { recursive: true });
  const summary = (r: ReturnType<typeof run>) => Object.fromEntries(Object.entries(r.out).map(([m, v]) => [m, Object.fromEntries((Object.keys(v.per[0] ?? {}) as (keyof Scores)[]).map((k): [string, number] => [String(k), +mean(v.per.map((p) => p[k])).toFixed(4)]).concat([["latencyMs", +mean(v.ms).toFixed(2)]]))]));
  writeFileSync("docs/evals/code-search.json", JSON.stringify({ repository: s.repository, sha: s.pinnedSha, dev: summary(dev), heldOut: summary(held), stress: summary(stress), test: summary(test), n: { dev: dev.n, heldOut: held.n, stress: stress.n, test: test.n } }, null, 2) + "\n");
  writeFileSync("docs/evals/code-search.md", lines.join("\n"));
}
