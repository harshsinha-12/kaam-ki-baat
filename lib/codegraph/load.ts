import type { EvidenceSnapshot } from "../contracts";
import { buildCodeGraph, type CodeGraph } from "./graph";

// Graph is derived from the SHA-pinned snapshot and cached per SHA.
const cache = new Map<string, CodeGraph>();
export function getCodeGraph(s: EvidenceSnapshot): CodeGraph {
  const key = `${s.repository}@${s.pinnedSha}`;
  if (!cache.has(key)) cache.set(key, buildCodeGraph(s.repository, s.pinnedSha, s.files));
  return cache.get(key)!;
}
