import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET } from "../app/api/evals/route";
import { evaluateCall, type EvaluationDashboard } from "../lib/eval/dashboard";

test("evaluations open without a board key and retain safe cache and outage behavior", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kkb-eval-access-"));
  const names = ["KKB_EVAL_DIR", "KKB_BOARD_KEY", "BOLNA_AGENT_ID", "BOLNA_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
  const previous = names.map(name => process.env[name]);
  const oldFetch = globalThis.fetch;
  const agentId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const saved: EvaluationDashboard = {
    schema: 1, agentId, syncedAt: new Date().toISOString(), warnings: [],
    calls: [evaluateCall({ id: "synthetic-call", status: "completed", conversation_duration: 50 }, {}, null)],
  };
  try {
    names.forEach(name => delete process.env[name]);
    process.env.KKB_EVAL_DIR = directory;
    process.env.BOLNA_AGENT_ID = agentId;
    process.env.BOLNA_API_KEY = "synthetic-provider-key";
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error("Synthetic provider outage"); };
    const persist = () => writeFile(path.join(directory, "latest.json"), JSON.stringify(saved));
    await persist();
    const fresh = await GET();
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("Cache-Control"), "private, no-store");
    assert.equal(fresh.headers.get("Referrer-Policy"), "no-referrer");
    assert.deepEqual((await fresh.json()).calls, saved.calls);
    assert.equal(requests, 0, "fresh persisted evaluations avoid a provider request");

    // A configured board key must not reinstate the old evaluation gate.
    process.env.KKB_BOARD_KEY = "synthetic-unused-board-key";
    saved.syncedAt = "2026-01-01T00:00:00.000Z";
    await persist();
    const stale = await GET();
    assert.equal(stale.status, 200);
    assert.equal((await stale.json()).stale, true);
    assert.equal(requests, 1);

    saved.agentId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await persist();
    const mismatch = await GET();
    assert.equal(mismatch.status, 503, "another agent's saved evaluations are not served");
    assert.doesNotMatch(await mismatch.text(), /synthetic-call|synthetic-provider-key/);
    await rm(path.join(directory, "latest.json"));
    assert.equal((await GET()).status, 503, "an outage without saved evaluations remains explicit");
  } finally {
    globalThis.fetch = oldFetch;
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    await rm(directory, { recursive: true, force: true });
  }
});
