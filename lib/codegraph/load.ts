import type { EvidenceSnapshot } from "../contracts";
import { buildCodeGraph, type CodeGraph } from "./graph";

// Selected files can differ between snapshots of the same repository/SHA.
// Cache by immutable snapshot identity so one selection cannot leak into another.
const cache = new WeakMap<EvidenceSnapshot, CodeGraph>();
export function getCodeGraph(s: EvidenceSnapshot): CodeGraph {
  if (!cache.has(s)) cache.set(s, buildCodeGraph(s.repository, s.pinnedSha, s.files));
  return cache.get(s)!;
}
