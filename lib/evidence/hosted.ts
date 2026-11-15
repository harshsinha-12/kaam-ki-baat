import type { EvidenceSnapshot } from "../contracts";
import { loadSnapshot } from "./load";
import { RedisClient, redisConfig } from "../store/redis";

export function validateHostedSnapshot(value: unknown): EvidenceSnapshot {
  if (!value || typeof value !== "object") throw new Error("Hosted evidence snapshot is invalid.");
  const s = value as EvidenceSnapshot;
  if (!["LIVE", "FIXTURE"].includes(s.label) || typeof s.repository !== "string" || typeof s.pinnedSha !== "string"
    || ![s.files,s.participants,s.meetings,s.passages,s.tasks,s.pullRequests,s.checks].every(Array.isArray)
    || s.files.some(f => typeof f.path !== "string" || typeof f.content !== "string")) throw new Error("Hosted evidence snapshot is invalid.");
  return s;
}

export async function loadRuntimeSnapshot(): Promise<EvidenceSnapshot> {
  const configured = redisConfig();
  if (configured) {
    const key = process.env.KKB_SNAPSHOT_KEY?.trim() || `${configured.namespace}:snapshot`;
    const raw = await new RedisClient(configured).get(key);
    if (!raw) throw new Error("Hosted evidence snapshot has not been imported.");
    return validateHostedSnapshot(JSON.parse(raw));
  }
  if (process.env.VERCEL) throw new Error("Hosted evidence storage is not configured.");
  return loadSnapshot();
}
