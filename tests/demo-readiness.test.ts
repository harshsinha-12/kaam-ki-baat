import { it } from "node:test";
import assert from "node:assert/strict";
import { agentChecks, readinessReport, sourceChecks } from "../lib/eval/readiness";
import { buildBolnaTools } from "../lib/adapters/bolna";
import { buildSpatialBolnaTools } from "../lib/spatial/bolna-config";
import { testSnapshot } from "./helpers/snapshot";

const origin = "https://callback.example.com";
const key = "private-server-key-12345678901234567890";
function agent() {
  const definitions = [...buildBolnaTools(origin, key), ...buildSpatialBolnaTools(origin, key)];
  return { tasks: [{ task_type: "conversation", tools_config: { api_tools: {
    tools: definitions.map(({ value, ...tool }) => tool),
    tools_params: Object.fromEntries(definitions.map(tool => [tool.name, tool.value])),
  } } }] };
}

it("rejects fixture sources, cross-meeting task passages and participant scope mismatches", () => {
  const snapshot = testSnapshot();
  assert.equal(sourceChecks(snapshot).find(c => c.name === "live_source")?.state, "fail");
  snapshot.tasks = [snapshot.tasks[0]];
  snapshot.participants = [snapshot.participants[0]];
  snapshot.participants[0].taskIds = ["t1"];
  snapshot.tasks[0].meetingId = "m2";
  const checks = sourceChecks(snapshot);
  assert.equal(checks.find(c => c.name === "source_passages")?.state, "fail");
  assert.equal(checks.find(c => c.name === "participant_scope")?.state, "fail");
});

it("allows truthful setup with an unlinked meeting while preserving the warning and call hold", () => {
  const snapshot = testSnapshot();
  snapshot.label = "LIVE";
  snapshot.meetings = [{ ...snapshot.meetings[0], source: "LIVE" }];
  snapshot.tasks = [{ ...snapshot.tasks[0], prNumber: undefined }];
  snapshot.participants = [{ ...snapshot.participants[0], taskIds: ["t1"] }];
  snapshot.pinnedSha = "a".repeat(40);
  snapshot.fetchedAt = new Date().toISOString();
  const report = readinessReport(sourceChecks(snapshot));
  assert.equal(report.setupReady, true);
  assert.equal(report.checks.find(c => c.name === "meeting_code_link")?.state, "warning");
  assert.match(report.callAuthorization, /HELD/);
  assert.equal(report.callsStarted, 0);
  assert.equal(readinessReport([]).setupReady, false);
});

it("requires all six persisted callbacks, correct authentication and parameter forwarding", () => {
  const raw = agent();
  assert.ok(agentChecks({ content: [{ type: "text", text: JSON.stringify(raw) }] }, origin, key, true).every(c => c.state === "pass"));
  raw.tasks[0].tools_config.api_tools.tools_params.control_page.url = "https://stale.example.com/api/spatial/tools/control_page";
  assert.equal(agentChecks(raw, origin, key, true).find(c => c.name === "agent_callbacks")?.state, "fail");
  raw.tasks[0].tools_config.api_tools.tools.pop();
  assert.equal(agentChecks(raw, origin, key, true).find(c => c.name === "agent_functions")?.state, "fail");
  const report = JSON.stringify(readinessReport(agentChecks(raw, origin, key, true)));
  assert.ok(!report.includes(key));
  assert.ok(!report.includes("stale.example.com"));
  assert.equal(agentChecks({ content: [{ type: "text", text: "PRIVATE ERROR" }] }, origin, key, true)[0].state, "pending");
});

it("rejects a wrong server key, missing caller forwarding and a changed confirmation type", () => {
  const raw = agent();
  const params = raw.tasks[0].tools_config.api_tools.tools_params;
  params.get_my_brief.api_token = "Bearer wrong-key";
  assert.equal(agentChecks(raw, origin, key, true).find(c => c.name === "agent_callbacks")?.state, "fail");
  params.get_my_brief.api_token = `Bearer ${key}`;
  params.get_my_brief.param.call_token = "{{unresolved_context}}";
  assert.equal(agentChecks(raw, origin, key, true).find(c => c.name === "agent_callbacks")?.state, "fail");
  const save = raw.tasks[0].tools_config.api_tools.tools.find(t => t.name === "record_task_update")!;
  (save.parameters.properties as Record<string, { type: string }>).confirmed.type = "string";
  assert.equal(agentChecks(raw, origin, key, true).find(c => c.name === "agent_functions")?.state, "fail");
});
