import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTool, type Runtime } from "../lib/tools/runtime";
import { zoneSetup } from "./helpers/zones";

// Voice agents can fire a second tool call before the first finishes. Both turns
// must be answered in order instead of the second failing with "try again".
describe("runtime turn lock", () => {
  it("serves two overlapping tool calls for the same call", async () => {
    const z = await zoneSetup();
    const rt: Runtime = { store: z.store, snapshot: z.snapshot, conversations: new Map() };
    const [a, b] = await Promise.all([
      runTool(rt, "get_my_brief", { call_token: z.devCall.token }),
      runTool(rt, "get_task_evidence", { call_token: z.devCall.token, question: "where is persistVerifiedUpdate" }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const calls = (await z.store.all()).filter((e) => e.type === "tool_call");
    assert.equal(calls.length, 2);
  });

  it("an unparseable 'since' falls back to the last day instead of comparing garbage", async () => {
    const z = await zoneSetup();
    const rt: Runtime = { store: z.store, snapshot: z.snapshot, conversations: new Map() };
    const r = await runTool(rt, "get_changes", { call_token: z.devCall.token, since: "yesterday-ish" });
    assert.equal(r.status, 200);
    assert.ok(!Number.isNaN(Date.parse(String(r.body.since))));
  });
});
