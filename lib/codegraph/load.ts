import type { EvidenceSnapshot } from "../contracts";
import { buildCodeGraph, type CodeGraph } from "./graph";

// Selected files can differ between snapshots of the same repository/SHA.
// Cache by immutable snapshot identity so one selection cannot leak into another.
const cache = new WeakMap<EvidenceSnapshot, CodeGraph>();
export function getCodeGraph(s: EvidenceSnapshot): CodeGraph {
  if (!cache.has(s)) {
    const graph = buildCodeGraph(s.repository, s.pinnedSha, s.files);
    // Other-language or documentation-only repositories remain browsable.
    // File nodes do not imply parsed symbols or inferred relationships.
    if (!graph.nodes.length) graph.nodes = s.files.map(file => ({ id: `file:${file.path}`, kind: "file", label: file.path.split("/").pop()!, path: file.path, line: 1, degree: 0 }));
    cache.set(s, graph);
  }
  return cache.get(s)!;
}
