import { it } from "node:test";
import assert from "node:assert/strict";
import { evaluationMarkdown } from "../lib/eval/recorder";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
it("keeps pending durations inconclusive and requires strictly over 45 seconds", () => {
  assert.match(evaluationMarkdown({ id, status: "call-disconnected", conversation_duration: 99 }, [], "c"), /Duration >45s: inconclusive/);
  for (const [duration, verdict] of [[45, "fail"], [46, "pass"]]) {
    assert.match(evaluationMarkdown({ id, status: "completed", conversation_duration: duration }, [], "c"), new RegExp(`Duration >45s: ${verdict}`));
  }
});
it("never exports arbitrary provider or audit strings", () => {
  const report = evaluationMarkdown({ id, status: "secret-provider-text", transcript: "PRIVATE", summary: "PRIVATE", agent_version_id: "PRIVATE" }, [{ type: "tool_call", at: "PRIVATE", callId: "c", tool: "PRIVATE", ok: false, summary: "PRIVATE", evidenceIds: ["PRIVATE"] }], "c");
  assert.doesNotMatch(report, /PRIVATE|secret-provider-text/);
  assert.match(report, /unknown tool \| failure/);
  assert.throws(() => evaluationMarkdown({ id: "../escape" }, [], "c"));
});
