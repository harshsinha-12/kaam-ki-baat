import { it } from "node:test";
import assert from "node:assert/strict";
import { issueCallSession } from "../lib/auth/call-session";
import { EventStore } from "../lib/store/event-store";
import type { Runtime } from "../lib/tools/runtime";
import { testSnapshot } from "./helpers/snapshot";
import { POST } from "../app/api/spatial/bolna-session/route";

it("requires fresh browser consent, preloads only the authorized brief and persists execution correlation", async () => {
  const global = globalThis as unknown as { __kkbRuntime?: Runtime };
  const oldRuntime = global.__kkbRuntime;
  const names = ["KKB_BOARD_KEY", "KKB_ENABLE_WEB_CALLS", "BOLNA_API_KEY", "BOLNA_AGENT_ID"];
  const oldEnv = names.map(name => process.env[name]);
  const oldFetch = globalThis.fetch;
  const rt: Runtime = { store: new EventStore(null), snapshot: testSnapshot(), conversations: new Map() };
  const { token, session } = await issueCallSession(rt.store, { participantId: "dev", meetingIds: ["m1"], repository: "team/repo", consentRecordedBy: "synthetic setup", scenario: "test" });
  global.__kkbRuntime = rt;
  process.env.KKB_BOARD_KEY = "test-board-key"; process.env.KKB_ENABLE_WEB_CALLS = "true";
  process.env.BOLNA_API_KEY = "test-provider-key"; process.env.BOLNA_AGENT_ID = "test-agent";
  let requests = 0;
  const request = (body: object) => new Request("http://localhost/api/spatial/bolna-session", {
    method: "POST", headers: { Authorization: "Bearer test-board-key", "x-kkb-call-token": token, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    globalThis.fetch = async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.agent_id, "test-agent");
      assert.equal(body.user_data.call_token, token);
      assert.match(body.user_data.opening_brief, /Sync/);
      assert.doesNotMatch(body.user_data.opening_brief, /Private|test-provider-key/);
      assert.deepEqual(Object.keys(body.user_data).sort(), ["call_token", "opening_brief"]);
      return Response.json({ agent_id: "test-agent", run_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", sip_password: "ephemeral-test" });
    };
    assert.equal((await POST(request({}))).status, 400);
    assert.equal(requests, 0);
    assert.equal((await POST(request({ consented: true }))).status, 200);
    assert.equal((await POST(request({ consented: true }))).status, 409);
    assert.equal(requests, 1);
    const events = await rt.store.all();
    const receipt = events.find(e => e.type === "web_call_consent");
    assert.ok(receipt?.type === "web_call_consent" && receipt.participantId === "dev" && receipt.recording);
    const link = events.find(e => e.type === "call_execution");
    assert.ok(link?.type === "call_execution" && link.callId === session.callId && link.executionId === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    assert.doesNotMatch(JSON.stringify(events), /test-provider-key|ephemeral-test/);
  } finally {
    global.__kkbRuntime = oldRuntime; globalThis.fetch = oldFetch;
    names.forEach((name, i) => { if (oldEnv[i] === undefined) delete process.env[name]; else process.env[name] = oldEnv[i]; });
  }
});
