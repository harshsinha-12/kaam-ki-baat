import { createHash } from "node:crypto";
import type { CodeFinding, EvidenceSnapshot, Task } from "../contracts";

export interface CodeGraph {
  format: "kkb-graphify-v1";
  repository: string;
  commitSha: string;
  builtAt: string;
  graphifyVersion: string;
  sourceSchemaVersion?: string | number;
  fileHashes: Record<string, string>;
  nodes: Array<{ id: string; label: string; path: string; line: number }>;
  edges: Array<{ source: string; target: string; relation: string; confidence: "EXTRACTED" | "INFERRED" }>;
}

export const contentHash = (content: string) => createHash("sha256").update(content).digest("hex");
export const safeSourcePath = (p: string) => p.length > 0 && !p.startsWith("/") && !/[\\\0\r\n:]/.test(p) && p.split("/").every((s) => s !== ".." && s !== "." && s !== "");
const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
type Node = CodeGraph["nodes"][number];
type Edge = CodeGraph["edges"][number];
type Index = { nodes: Map<string, Node>; terms: Map<string, Set<string>>; neighbors: Map<string, Array<{ node: Node; edge: Edge; direction: "outgoing" | "incoming" }>>; files: Map<string, string[]> };
// Snapshots are immutable after loading. Compile once per snapshot, rather than
// re-reading every source line on every phone turn. A new snapshot gets a new index.
const indexes = new WeakMap<EvidenceSnapshot, Index | null>();

function indexFor(snapshot: EvidenceSnapshot): Index | null {
  if (indexes.has(snapshot)) return indexes.get(snapshot)!;
  let index: Index | null = null;
  try {
    const g = snapshot.codeGraph;
    if (!g || g.format !== "kkb-graphify-v1" || g.repository !== snapshot.repository || g.commitSha !== snapshot.pinnedSha || !Number.isFinite(Date.parse(g.builtAt)) || g.nodes.length > 50_000 || g.edges.length > 200_000) throw new Error("unusable graph");
    const files = new Map(snapshot.files.map((f) => [f.path, f.content]));
    for (const [p, hash] of Object.entries(g.fileHashes)) {
      if (!safeSourcePath(p) || !files.has(p) || contentHash(files.get(p)!) !== hash) throw new Error("stale or out-of-scope graph");
    }
    index = { nodes: new Map(), terms: new Map(), neighbors: new Map(), files: new Map() };
    for (const n of g.nodes) {
      if (!n.id || index.nodes.has(n.id) || !Object.hasOwn(g.fileHashes, n.path) || typeof n.label !== "string" || !n.label || n.label.length > 200 || !Number.isSafeInteger(n.line)) throw new Error("invalid graph node");
      const lines = index.files.get(n.path) ?? files.get(n.path)!.split("\n");
      if (n.line < 1 || n.line > lines.length) throw new Error("invalid source range");
      index.files.set(n.path, lines);
      index.nodes.set(n.id, n);
      // Labels and paths only: no model-generated summaries or meeting text.
      for (const word of new Set([...words(n.label), n.label.toLowerCase().replace(/[^a-z0-9_-]/g, ""), ...words(n.path)])) {
        if (!word) continue;
        const ids = index.terms.get(word) ?? new Set<string>();
        ids.add(n.id);
        index.terms.set(word, ids);
      }
    }
    for (const e of g.edges) {
      const source = index.nodes.get(e.source), target = index.nodes.get(e.target);
      if (!source || !target || !/^[a-z_]{1,40}$/.test(e.relation) || !["EXTRACTED", "INFERRED"].includes(e.confidence)) throw new Error("invalid graph edge");
      for (const [id, node, direction] of [[e.source, target, "outgoing"], [e.target, source, "incoming"]] as const) {
        const list = index.neighbors.get(id) ?? [];
        list.push({ node, edge: e, direction });
        index.neighbors.set(id, list);
      }
    }
  } catch { index = null; }
  indexes.set(snapshot, index);
  return index;
}

export const hasUsableCodeGraph = (snapshot: EvidenceSnapshot) => indexFor(snapshot) !== null;

export function graphFindings(snapshot: EvidenceSnapshot, task: Task | undefined, terms: string[], limit: number): CodeFinding[] {
  const index = indexFor(snapshot);
  if (!index) return [];
  const scores = new Map<string, number>();
  for (const term of new Set(terms.flatMap((t) => [...words(t), t.toLowerCase().replace(/[^a-z0-9_-]/g, "")]))) {
    for (const id of index.terms.get(term) ?? []) scores.set(id, (scores.get(id) ?? 0) + 1);
  }
  const seeds = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  const pr = snapshot.pullRequests.find((p) => p.repository === snapshot.repository && p.number === task?.prNumber);
  const result: CodeFinding[] = [];
  const seen = new Set<string>();
  const add = (n: Node, via?: NonNullable<CodeFinding["retrieval"]>["via"]) => {
    const key = `${n.path}:${n.line}`;
    if (seen.has(key) || result.length >= limit) return;
    seen.add(key);
    const lines = index.files.get(n.path)!;
    const end = Math.min(lines.length, n.line + 2);
    // Graph labels remain retrieval hints; the excerpt comes from pinned source.
    const symbol = n.label.replace(/^\./, "").replace(/\(\)$/, "");
    result.push({ kind: "code", id: `code:${snapshot.pinnedSha.slice(0, 7)}:${n.path}:${n.line}`, repository: snapshot.repository,
      commitSha: snapshot.pinnedSha, path: n.path, lineStart: n.line, lineEnd: end,
      symbol: /^[a-zA-Z_$][\w$]*$/.test(symbol) && lines[n.line - 1].includes(symbol) ? symbol : undefined,
      excerpt: lines.slice(n.line - 1, end).join("\n").slice(0, 400),
      match: !via && pr?.changedFiles.includes(n.path) ? "confirmed" : "candidate",
      url: `https://github.com/${snapshot.repository}/blob/${snapshot.pinnedSha}/${n.path}#L${n.line}-L${end}`,
      retrieval: { method: "graphify", builtAt: snapshot.codeGraph!.builtAt, via },
    });
  };
  // Put the best definition first, then one-hop relationships for KT. Bound both
  // seeds and expansion; caller-supplied questions cannot request the whole graph.
  if (seeds.length) {
    const first = index.nodes.get(seeds[0][0])!;
    add(first);
    const neighbors = (index.neighbors.get(first.id) ?? []).slice(0, 128).sort((a, b) => {
      const rank = (e: Edge) => ["calls", "uses", "imports", "inherits", "references"].indexOf(e.relation);
      return (rank(a.edge) < 0 ? 99 : rank(a.edge)) - (rank(b.edge) < 0 ? 99 : rank(b.edge)) || a.node.id.localeCompare(b.node.id);
    });
    for (const { node, edge, direction } of neighbors.slice(0, 32)) {
      add(node, { symbol: first.label, relation: edge.relation, confidence: edge.confidence, direction });
    }
    for (const [id] of seeds.slice(1)) add(index.nodes.get(id)!);
  }
  return result;
}
