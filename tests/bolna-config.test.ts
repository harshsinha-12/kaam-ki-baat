import { it } from "node:test";
import assert from "node:assert/strict";
import { buildBolnaTools } from "../lib/adapters/bolna";

it("binds all four runtime tools to authenticated callbacks with per-call context", () => {
  const tools = buildBolnaTools("https://demo.example.com/", "x".repeat(40));
  assert.deepEqual(tools.map(t => t.name), ["get_my_brief", "get_task_evidence", "get_changes", "record_task_update"]);
  for (const tool of tools) {
    assert.equal(tool.value.url, `https://demo.example.com/api/tools/${tool.name}`);
    assert.equal(tool.value.method, "POST");
    assert.equal(tool.value.api_token, `Bearer ${"x".repeat(40)}`);
    assert.equal(tool.value.param.call_token, "%(call_token)s");
    assert.ok(tool.parameters.required.includes("call_token"));
    assert.ok(!("participant_id" in tool.parameters.properties));
    assert.ok(!("actor_id" in tool.parameters.properties));
  }
  const write = tools.find(t => t.name === "record_task_update")!;
  assert.ok(write.parameters.required.includes("confirmed"));
  assert.ok(write.parameters.required.includes("idempotency_key"));
});

it("rejects insecure or misdirected callback origins and absent server keys", () => {
  for (const url of ["http://demo.example.com", "https://user:password@demo.example.com", "https://demo.example.com/path", "https://demo.example.com?key=secret"]) {
    assert.throws(() => buildBolnaTools(url, "x".repeat(40)), /HTTPS origin/);
  }
  assert.throws(() => buildBolnaTools("https://demo.example.com", ""), /KKB_TOOL_KEY/);
});
