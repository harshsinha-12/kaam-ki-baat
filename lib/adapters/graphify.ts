import path from "node:path";
import type { EvidenceSnapshot } from "../contracts";
import { contentHash, safeSourcePath, type CodeGraph } from "../evidence/code-graph";

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

// NetworkX node-link JSON from Graphify's code-only extractor. The extraction
// root must contain ONLY the snapshot's pinned code files, not the working tree.
export function importGraphify(raw: unknown, snapshot: EvidenceSnapshot, scanRoot: string, version: string): CodeGraph {
  const data = record(raw), meta = record(data.graph);
  const edges = data.links ?? data.edges;
  if (!Array.isArray(data.nodes) || !Array.isArray(edges) || data.nodes.length > 50_000 || edges.length > 200_000) throw new Error("Unsupported or oversized Graphify export");
  const files = new Map(snapshot.files.map((f) => [f.path, f.content]));
  const nodes: CodeGraph["nodes"] = [];
  const ids = new Set<string>();
  for (const value of data.nodes) {
    const n = record(value);
    if (n.file_type !== "code" || typeof n.source_file !== "string" || !n.source_file) continue;
    const source = path.isAbsolute(n.source_file) ? path.relative(scanRoot, n.source_file) : n.source_file.replace(/^\.\//, "");
    if (!safeSourcePath(source) || !files.has(source)) continue;
    const location = typeof n.source_location === "string" ? /^L(\d+)(?:-L?\d+)?$/.exec(n.source_location) : null;
    const line = location ? Number(location[1]) : 0;
    if (typeof n.id !== "string" || !n.id || ids.has(n.id) || typeof n.label !== "string" || !n.label || n.label.length > 200 || !Number.isSafeInteger(line) || line < 1 || line > files.get(source)!.split("\n").length) continue;
    ids.add(n.id);
    nodes.push({ id: n.id, label: n.label, path: source, line });
  }
  if (!nodes.length) throw new Error("Graphify returned no usable code locations");
  const normalized: CodeGraph["edges"] = [];
  for (const value of edges) {
    const e = record(value);
    if (typeof e.source !== "string" || typeof e.target !== "string" || !ids.has(e.source) || !ids.has(e.target) || typeof e.relation !== "string" || !/^[a-z_]{1,40}$/.test(e.relation) || (e.confidence !== "EXTRACTED" && e.confidence !== "INFERRED")) continue;
    normalized.push({ source: e.source, target: e.target, relation: e.relation, confidence: e.confidence });
  }
  return { format: "kkb-graphify-v1", repository: snapshot.repository, commitSha: snapshot.pinnedSha,
    builtAt: new Date().toISOString(), graphifyVersion: version,
    sourceSchemaVersion: typeof meta.schema_version === "number" || typeof meta.schema_version === "string" ? meta.schema_version : undefined,
    fileHashes: Object.fromEntries([...new Set(nodes.map((n) => n.path))].map((p) => [p, contentHash(files.get(p)!)])), nodes, edges: normalized };
}
