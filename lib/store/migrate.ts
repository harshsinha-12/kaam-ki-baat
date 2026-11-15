import { createHash } from "node:crypto";
import { validateHostedSnapshot } from "../evidence/hosted";
import type { StoredEvent } from "./event-store";
import { RedisClient, RedisEventBackend } from "./redis";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Explicit one-way import. Refuses divergent logs and never replaces a snapshot. */
export async function migrateHosted(redis: RedisClient, snapshot: unknown, events: StoredEvent[]) {
  const approved = validateHostedSnapshot(snapshot);
  if (events.some(e => !e || typeof e.at !== "string" || !["task_update","call_session","web_call_consent","call_execution","tool_call","communicated","zone"].includes(e.type))) throw new Error("Invalid event log; import refused.");
  const snapshotHash = digest(approved);
  const snapshotKey = `${redis.config.namespace}:snapshot:${snapshotHash}`;
  await redis.setIfAbsent(snapshotKey, JSON.stringify(approved));
  const savedSnapshot = await redis.get(snapshotKey);
  if (!savedSnapshot || digest(JSON.parse(savedSnapshot)) !== snapshotHash) throw new Error("Snapshot import read-back mismatch.");
  const backend = new RedisEventBackend(redis);
  let existing = await backend.read();
  if (existing.length > events.length || digest(existing) !== digest(events.slice(0, existing.length))) throw new Error("Hosted audit differs from local audit. Import refused; no events overwritten.");
  while (existing.length < events.length) {
    const batch = events.slice(existing.length, existing.length + 100);
    if (!await backend.compareAppend(existing.length, batch)) throw new Error("Hosted audit changed during import. Stop active writers before retrying.");
    existing = await backend.read();
    if (digest(existing) !== digest(events.slice(0, existing.length))) throw new Error("Audit import read-back mismatch.");
  }
  return { snapshotKey, snapshotHash, eventCount: existing.length, eventHash: digest(existing), repository: approved.repository, pinnedSha: approved.pinnedSha };
}
