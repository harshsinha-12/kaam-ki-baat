// Code graph for the Code Navigator, modelled on Graphify's ideas (knowledge
// graph instead of grep, "god nodes", communities, explainable paths) but
// dependency-free TypeScript over the SHA-pinned snapshot files.
// Every node carries path + line at the pinned commit, so answers stay checkable.

export type NodeKind = "file" | "test" | "function" | "class" | "interface" | "type" | "const";
export type EdgeKind = "defines" | "imports" | "uses" | "tests";

export interface GNode { id: string; kind: NodeKind; label: string; path: string; line: number; community?: number; degree?: number }
export interface GEdge { from: string; to: string; kind: EdgeKind }
export interface CodeGraph {
  repository: string;
  sha: string;
  nodes: GNode[];
  edges: GEdge[];
  communities: { id: number; label: string; size: number }[];
  godNodes: string[];
}

const SRC = /\.(ts|tsx)$/;
const isTest = (p: string) => /(^|\/)tests?\//.test(p) || /\.test\./.test(p);
const DEF = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|type|const)\s+([A-Za-z0-9_]+)/;

export function buildCodeGraph(repository: string, sha: string, files: { path: string; content: string }[]): CodeGraph {
  const src = files.filter((f) => SRC.test(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Set(src.map((f) => f.path));
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const exported = new Map<string, { name: string; id: string }[]>(); // path -> exported symbols

  for (const f of src) {
    const fid = `file:${f.path}`;
    nodes.set(fid, { id: fid, kind: isTest(f.path) ? "test" : "file", label: f.path.split("/").pop()!, path: f.path, line: 1 });
    const syms: { name: string; id: string }[] = [];
    f.content.split("\n").forEach((line, i) => {
      const m = line.match(DEF);
      if (!m) return;
      const sid = `sym:${f.path}#${m[2]}`;
      nodes.set(sid, { id: sid, kind: m[1] as NodeKind, label: m[2], path: f.path, line: i + 1 });
      edges.push({ from: fid, to: sid, kind: "defines" });
      syms.push({ name: m[2], id: sid });
    });
    exported.set(f.path, syms);
  }

  for (const f of src) {
    const fid = `file:${f.path}`;
    for (const m of f.content.matchAll(/from\s+["']([^"']+)["']/g)) {
      const target = resolveImport(f.path, m[1], paths);
      if (!target || target === f.path) continue;
      edges.push({ from: fid, to: `file:${target}`, kind: isTest(f.path) ? "tests" : "imports" });
      // symbol-level "uses": imported names that this file actually mentions
      const names = (m[0] && f.content.slice(0, m.index).split("import").pop()) || "";
      for (const s of exported.get(target) ?? []) {
        if (new RegExp(`\\b${s.name}\\b`).test(names)) edges.push({ from: fid, to: s.id, kind: isTest(f.path) ? "tests" : "uses" });
      }
    }
  }

  const deg = new Map<string, number>();
  for (const e of edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
  for (const n of nodes.values()) n.degree = deg.get(n.id) ?? 0;

  const communities = detectCommunities([...nodes.values()], edges);
  const godNodes = [...nodes.values()].filter((n) => n.kind !== "test").sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0) || a.id.localeCompare(b.id)).slice(0, 8).map((n) => n.id);
  return { repository, sha, nodes: [...nodes.values()], edges: dedupe(edges), communities, godNodes };
}

export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) {
    const parts = from.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    base = parts.join("/");
  } else return null; // external package
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (paths.has(c)) return c;
  return null;
}

/** Deterministic label propagation over the undirected graph (Graphify uses Leiden; LPA is a dependency-free stand-in). */
function detectCommunities(nodes: GNode[], edges: GEdge[]) {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }
  // seed labels by top-level folder so communities read like the codebase
  const label = new Map<string, string>(nodes.map((n) => [n.id, n.path.split("/").slice(0, 2).join("/")]));
  const order = nodes.map((n) => n.id).sort();
  for (let it = 0; it < 12; it++) {
    let changed = false;
    for (const id of order) {
      const counts = new Map<string, number>();
      for (const nb of adj.get(id) ?? []) counts.set(label.get(nb)!, (counts.get(label.get(nb)!) ?? 0) + 1);
      counts.set(label.get(id)!, (counts.get(label.get(id)!) ?? 0) + 0.5); // inertia
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      if (best && best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  const ids = [...new Set(label.values())].sort();
  for (const n of nodes) n.community = ids.indexOf(label.get(n.id)!);
  return ids.map((l, i) => ({ id: i, label: l, size: nodes.filter((n) => n.community === i).length })).filter((c) => c.size > 0);
}

const dedupe = (es: GEdge[]) => [...new Map(es.map((e) => [`${e.from}>${e.to}>${e.kind}`, e])).values()];

// ---------------------------------------------------------------- query
export interface GraphAnswer {
  seed: GNode | null;
  path: { node: GNode; via: EdgeKind | "match"; why: string }[];
  subgraph: { nodes: string[]; edges: GEdge[] };
  match: "confirmed" | "candidate" | "none";
  explanation: string[];
}

const STOP = new Set("the a an is are where which what how does do in of to for and code file function kahan hai kya ka ki ke ko woh wo show me find".split(" "));

/** Find where a question lands in the code, and explain the hop-by-hop reasoning. */
export function queryGraph(g: CodeGraph, question: string, files: { path: string; content: string }[], changedInPr: Set<string> = new Set()): GraphAnswer {
  const words = question.toLowerCase().split(/[^a-z0-9_-]+/).filter((t) => t.length > 2 && !STOP.has(t));
  const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ies|es|ed|s)$/, "") : w);
  const terms = [...new Set(words.map(stem).filter((t) => t.length > 2))];
  // "read back" ~ read-back / read_back / readback (identifier styles)
  const phrases = words.slice(0, -1).flatMap((w, i) => [`${w}-${words[i + 1]}`, `${w}_${words[i + 1]}`, `${w}${words[i + 1]}`]);
  const content = new Map(files.map((f) => [f.path, f.content.toLowerCase()]));
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  // IDF: rare terms ("hysteresis", "dedupe") decide; common ones ("read", "code") barely count.
  const N = Math.max(1, content.size);
  const idf = new Map(terms.map((t) => [t, Math.log(1 + N / (1 + [...content.values()].filter((c) => c.includes(t)).length))]));
  const w = (ts: string[]) => ts.reduce((a, t) => a + (idf.get(t) ?? 1), 0);
  let best: { n: GNode; score: number; hits: string[] } | null = null;
  for (const n of g.nodes) {
    if (n.kind === "file" || n.kind === "test" || isTest(n.path)) continue; // tests are coverage, not the answer
    const name = n.label.toLowerCase();
    const text = content.get(n.path) ?? "";
    const body = docComment(text, n.line) + "\n" + sliceBody(text, n.line);
    const header = fileHeader(text);
    const nameHits = terms.filter((t) => name.includes(t.replace(/-/g, "")));
    const bodyHits = terms.filter((t) => !nameHits.includes(t) && body.includes(t));
    const phraseHits = phrases.filter((p) => body.includes(p) || name.includes(p));
    const headerHits = terms.filter((t) => !nameHits.includes(t) && !bodyHits.includes(t) && header.includes(t));
    const hits = [...nameHits, ...bodyHits, ...phraseHits, ...headerHits];
    const kindBias = n.kind === "function" ? 1.5 : n.kind === "class" ? 1 : n.kind === "const" ? 0.5 : -1;
    // Behaviour lives in lib/ and app/api; .tsx pages mostly hold copy about it.
    const layerBias = n.path.endsWith(".tsx") ? -2.5 : n.path.startsWith("scripts/") ? -1 : 0;
    const score = w(nameHits) * 2 + w(bodyHits) + phraseHits.length * 2 + w(headerHits) * 0.6 + kindBias + layerBias + Math.min(1, (n.degree ?? 0) / 20);
    if (hits.length && (!best || score > best.score)) best = { n, score, hits };
  }
  if (!best) return { seed: null, path: [], subgraph: { nodes: [], edges: [] }, match: "none", explanation: ["No symbol in the graph matches that question at this commit."] };

  const seed = best.n;
  const file = byId.get(`file:${seed.path}`)!;
  const users = g.edges.filter((e) => e.to === seed.id && e.kind === "uses").map((e) => byId.get(e.from)!).filter(Boolean);
  const tests = g.edges.filter((e) => (e.to === seed.id || e.to === file.id) && e.kind === "tests").map((e) => byId.get(e.from)!).filter(Boolean);
  const path: GraphAnswer["path"] = [
    { node: seed, via: "match", why: `“${best.hits.join("”, “")}” matched ${seed.kind} ${seed.label}` },
    { node: file, via: "defines", why: `defined in ${seed.path} at line ${seed.line}` },
    ...users.slice(0, 2).map((u) => ({ node: u, via: "uses" as const, why: `called from ${u.path}` })),
    ...tests.slice(0, 1).map((t) => ({ node: t, via: "tests" as const, why: `related test file ${t.path} (static link, execution unverified)` })),
  ];
  const ids = new Set(path.map((p) => p.node.id));
  // Static graph links help locate code; they cannot confirm task semantics,
  // coverage or completion merely because a file appears in a PR.
  const match = "candidate";
  return {
    seed,
    path,
    subgraph: { nodes: [...ids], edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) },
    match,
    explanation: [
      ...path.map((p, i) => `${i + 1}. ${p.why}`),
      changedInPr.has(seed.path) ? "The file appears in the linked PR; this static graph result remains a candidate for review." : "Not linked to the PR, so treat it as a candidate until someone confirms.",
    ],
  };
}

/** Comment lines directly above a definition. */
function docComment(content: string, line: number): string {
  const lines = content.split("\n");
  const out: string[] = [];
  for (let i = line - 2; i >= 0 && /^\s*(\/\/|\/\*|\*)/.test(lines[i]); i--) out.unshift(lines[i]);
  return out.join("\n");
}

/** Leading comment lines in the first 25 lines of a file (its purpose statement). */
function fileHeader(content: string): string {
  return content.split("\n").slice(0, 25).filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
}

/** The symbol's own body: from its definition to the next top-level export (max 80 lines). */
function sliceBody(content: string, line: number): string {
  const lines = content.split("\n");
  const out = [lines[line - 1] ?? ""];
  for (let i = line; i < Math.min(lines.length, line + 80); i++) {
    if (/^\s*export\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

export function graphReport(g: CodeGraph): string {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return [
    `# Code graph — ${g.repository} @ ${g.sha.slice(0, 7)}`,
    "",
    `${g.nodes.length} nodes · ${g.edges.length} edges · ${g.communities.length} communities`,
    "",
    "## God nodes (most connected)",
    ...g.godNodes.map((id) => { const n = byId.get(id)!; return `- \`${n.label}\` (${n.kind}, ${n.path}:${n.line}) — degree ${n.degree}`; }),
    "",
    "## Communities",
    ...g.communities.sort((a, b) => b.size - a.size).map((c) => `- ${c.label} — ${c.size} nodes`),
    "",
  ].join("\n");
}
