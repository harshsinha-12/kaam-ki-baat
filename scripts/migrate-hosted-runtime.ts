// Explicit migration of the approved private snapshot and audit. Never prints tokens/passages.
// npm run storage:migrate -- --snapshot /private/snapshot.json --events /private/events.jsonl
import path from "node:path";
import { readFile } from "node:fs/promises";
import { RedisClient, redisConfig } from "../lib/store/redis";
import { migrateHosted } from "../lib/store/migrate";
import type { StoredEvent } from "../lib/store/event-store";
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
async function main() {
  const config = redisConfig();
  if (!config) throw new Error("Configure server-only hosted storage credentials first.");
  const snapshotFile = arg("snapshot"), eventsFile = arg("events");
  if (!snapshotFile || !eventsFile) throw new Error("Explicit --snapshot and --events paths required.");
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
  const events = (await readFile(eventsFile, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as StoredEvent);
  const redis = new RedisClient(config);
  const imported = await migrateHosted(redis, snapshot, events);
  const evalDir = arg("eval-dir");
  let evaluations = 0;
  if (evalDir) {
    const dashboard = JSON.parse(await readFile(path.join(evalDir, "latest.json"), "utf8"));
    if (dashboard.schema !== 1 || typeof dashboard.agentId !== "string" || !Array.isArray(dashboard.calls) || !Array.isArray(dashboard.warnings)) throw new Error("Invalid evaluation bundle.");
    if (!process.env.BOLNA_AGENT_ID || dashboard.agentId !== process.env.BOLNA_AGENT_ID) throw new Error("Evaluation agent mismatch.");
    for (const [suffix, value] of [["latest", dashboard], ["reviews", await readOptionalReviews(evalDir)]] as const) {
      if (!value) continue;
      const key = `${config.namespace}:eval:${suffix}`, text = JSON.stringify(value);
      await redis.setIfAbsent(key, text);
      if (await redis.get(key) !== text) throw new Error("Existing hosted evaluation differs; import refused.");
    }
    evaluations = dashboard.calls.length;
  }
  console.log(JSON.stringify({ ...imported, evaluations }, null, 2));
}
async function readOptionalReviews(directory: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path.join(directory, "reviews.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
main().catch(() => { console.error("Hosted import failed. Check configuration, approved inputs and audit consistency. No secrets were printed."); process.exitCode = 1; });
