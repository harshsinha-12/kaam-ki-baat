import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EvidenceSnapshot } from "../contracts";

// Live snapshot (private, gitignored) wins; otherwise the clearly labeled fixture.
export const PRIVATE_SNAPSHOT = "data/private/snapshot.json";
export const FIXTURE_SNAPSHOT = "data/demo/snapshot.fixture.json";

export function loadSnapshot(root = process.cwd()): EvidenceSnapshot {
  const explicit = process.env.KKB_SNAPSHOT;
  const candidates = explicit ? [explicit] : [PRIVATE_SNAPSHOT, FIXTURE_SNAPSHOT];
  for (const rel of candidates) {
    const p = path.resolve(root, rel);
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as EvidenceSnapshot;
  }
  throw new Error(`No evidence snapshot found. Run: npm run snapshot (looked in ${candidates.join(", ")})`);
}
