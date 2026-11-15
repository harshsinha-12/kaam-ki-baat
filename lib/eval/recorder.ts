import type { StoredEvent } from "../store/event-store";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function executionId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("Expected execution UUID");
  return value;
}
const terminal = new Set(["completed", "no-answer", "busy", "failed", "canceled", "stopped", "error", "balance-low"]);
const tools = new Set(["get_my_brief", "get_task_evidence", "get_changes", "record_task_update"]);

// Only typed metadata leaves the private input. Never interpolate summaries,
// transcripts, phone numbers, provider errors, consent text or tool responses.
export function evaluationMarkdown(raw: Record<string, unknown>, events: StoredEvent[], callId: string): string {
  const id = executionId(raw.id);
  const status = typeof raw.status === "string" && terminal.has(raw.status) ? raw.status : "pending";
  const duration = status !== "pending" && typeof raw.conversation_duration === "number" && Number.isFinite(raw.conversation_duration) && raw.conversation_duration >= 0 ? raw.conversation_duration : null;
  const version = typeof raw.agent_version_id === "string" && uuid.test(raw.agent_version_id) ? raw.agent_version_id : "unavailable";
  const session = events.find(e => e.type === "call_session" && e.session.callId === callId);
  const consent = session?.type === "call_session" && !!session.session.consentRecordedBy.trim();
  const calls = events.filter(e => e.type === "tool_call" && e.callId === callId);
  const communicated = events.filter(e => e.type === "communicated" && e.callId === callId);
  const rows = calls.map(e => e.type === "tool_call" ? `| ${tools.has(e.tool) ? e.tool : "unknown tool"} | ${e.ok ? "success" : "failure"} |` : "");
  return `# Call evaluation: ${id}

Source: Bolna get_execution / GET executions; local audit correlation supplied by operator.
Agent version: ${version}
Status: ${status}
Duration (seconds): ${duration ?? "unavailable"}
Duration >45s: ${duration === null ? "inconclusive" : duration > 45 ? "pass" : "fail"}
Consent record present: ${consent ? "yes (private audit; eligibility needs review)" : "unavailable"}
Overall eligibility: requires human review of consent, correlation and organizer rules.

Tool results (${calls.length || "unavailable"}):

| Tool | Result |
| --- | --- |
${rows.join("\n") || "| unavailable | inconclusive |"}

Communicated facts: ${communicated.length ? `${communicated.length} audit records; ${communicated.filter(e => e.type === "communicated" && e.acknowledged).length} acknowledged` : "unavailable (no communication audit records)"}.
Communication content: review private evidence; omitted from Git.
Failures: ${calls.length ? `${calls.filter(e => e.type === "tool_call" && !e.ok).length} failures in recorded tool calls` : "unavailable (no tool-call audit records)"}; provider error details remain private.
Saved actions: inconclusive until persisted write and read-back evidence are reviewed.
Human review: pending (grounding, interruption recovery, disclosure, focused fix).
`;
}
