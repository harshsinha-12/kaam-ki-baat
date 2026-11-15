import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCall, redactor } from "../lib/eval/dashboard";
const raw = { id: "3742594a-dae4-4d64-97aa-13cdc039f31f", agent_id: "agent", status: "completed", conversation_duration: 48, termination_reason: "user_hung_up", context_details: { recipient_data: { call_token: "private-call-token-1234", opening_brief: "Hello", repository_context: JSON.stringify({ sha: "abc", headers: { Authorization: "Bearer private-server-key" } }) } } };
test("nested JSON and echoed credentials never reach the evaluation", () => {
  const clean = redactor({ ...raw, logs: [{ data: '{"api_token":"Bearer private-server-key","call_token":"private-call-token-1234"}' }] });
  const result = JSON.stringify(clean.clean({ ...raw, text: "private-call-token-1234 Bearer private-server-key +919876543210" }));
  assert.ok(!result.includes("private-call-token-1234")); assert.ok(!result.includes("private-server-key")); assert.ok(!result.includes("919876543210")); assert.ok(result.includes("abc"));
});
test("duration and tool results remain independent of conversational quality", () => {
  const result = evaluateCall(raw, { progression: { transcript: [{ kind: "function_call", tool_name: "custom_task_get_task_evidence", response_status_code: 403, status: "completed" }, { kind: "message", role: "user", not_sent_to_agent: true, text: "हाँ" }] } }, null);
  assert.equal(result.findings.find(f => f.title.startsWith("Duration"))?.verdict, "pass");
  assert.equal(result.findings.find(f => f.title === "Tool execution")?.verdict, "fail");
  assert.equal(result.findings.find(f => f.title === "Utterance delivery")?.verdict, "fail");
  assert.equal(result.findings.find(f => f.title === "Saved action")?.verdict, "inconclusive");
});
test("repeated tool calls retain distinct request/response pairs", () => {
  const result = evaluateCall(raw, { progression: { transcript: [1, 2].map(() => ({ kind: "function_call", tool_name: "custom_task_get_project_context", response_status_code: 200 })) }, logs: [1, 2].flatMap(n => [{ component: "function_call", type: "request", tool_name: "custom_task_get_project_context", data: JSON.stringify({ question: `q${n}` }) }, { component: "function_call", type: "response", tool_name: "custom_task_get_project_context", data: JSON.stringify({ ok: true, answer: `a${n}` }) }]) }, []);
  assert.equal(result.tools.length, 2); assert.deepEqual(result.tools[1].response, { ok: true, answer: "a2" });
});
test("failed zero-second calls remain in results and missing debug does not pass", () => {
  const result = evaluateCall({ ...raw, status: "failed", conversation_duration: 0, termination_reason: "abandoned" }, {}, null);
  assert.equal(result.duration, 0); assert.equal(result.findings[0].verdict, "fail");
  assert.equal(result.findings.find(f => f.title === "Tool execution")?.verdict, "inconclusive");
  assert.equal(result.transcript, null);
});
