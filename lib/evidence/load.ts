import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EvidenceSnapshot } from "../contracts";
import { hasUsableCodeGraph } from "./code-graph";

// Live snapshot (private, gitignored) wins; otherwise the clearly labeled fixture.
export const PRIVATE_SNAPSHOT = "data/private/snapshot.json";
export const FIXTURE_SNAPSHOT = "data/demo/snapshot.fixture.json";

export function loadSnapshot(root = process.cwd()): EvidenceSnapshot {
  const explicit = process.env.KKB_SNAPSHOT;
  const candidates = explicit ? [explicit] : [PRIVATE_SNAPSHOT, FIXTURE_SNAPSHOT];
  for (const rel of candidates) {
    const p = path.resolve(root, rel);
    if (existsSync(p)) {
      const snapshot = JSON.parse(readFileSync(p, "utf8")) as EvidenceSnapshot;
      if (process.env.KKB_CODE_GRAPH) {
        try {
          snapshot.codeGraph = JSON.parse(readFileSync(path.resolve(root, process.env.KKB_CODE_GRAPH), "utf8"));
          if (!hasUsableCodeGraph(snapshot)) throw new Error("unusable graph");
        } catch {
          delete snapshot.codeGraph;
          console.warn("Graphify context unavailable or stale; using keyword retrieval.");
        }
      }
      return snapshot;
    }
  }
  throw new Error(`No evidence snapshot found. Run: npm run snapshot (looked in ${candidates.join(", ")})`);
}
