import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventStore, parseLog } from "../lib/store/event-store";

const rec = (id: string) => ({ id, taskId: "t1", actorId: "p1", callId: null, status: "in_progress" as const, idempotencyKey: `k-${id}`, at: "2026-11-16T00:00:00.000Z" });

test("a torn final line from an interrupted append is skipped, not fatal", () => {
  const good = JSON.stringify({ type: "task_update", at: "x", record: rec("a") });
  assert.equal(parseLog(`${good}\n{"type":"task_up`).length, 1);
});

test("a malformed line in the middle of the log is reported as corruption", () => {
  const good = JSON.stringify({ type: "task_update", at: "x", record: rec("a") });
  assert.throws(() => parseLog(`{oops\n${good}\n`), /corrupt at line 1/);
});

test("the next append removes a torn tail and the log stays readable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kkb-torn-"));
  const file = path.join(dir, "events.jsonl");
  await fs.writeFile(file, JSON.stringify({ type: "task_update", at: "x", record: rec("a") }) + "\n" + '{"type":"task_upd');
  const store = new EventStore(file);
  await store.writeOnce(rec("b"));
  const events = await new EventStore(file).all();
  assert.deepEqual(events.map((e) => e.type === "task_update" && e.record.id), ["a", "b"]);
  assert.ok((await fs.readFile(file, "utf8")).endsWith("\n"));
});
